"""Orquesta una corrida completa: scrape -> persistir -> enriquecer -> exportar.

Uso:
    uv run python -m src.main                # corrida diaria (hours_old de config)
    uv run python -m src.main --backfill     # primera corrida: última semana
    uv run python -m src.main --limit 2 --results 10   # prueba rápida
    uv run python -m src.main --skip-scrape  # solo re-enriquecer y exportar
"""

import argparse
import logging
from pathlib import Path

import yaml

from src import enrich, export_dashboard, scraper, storage

log = logging.getLogger("pipeline")

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline de empleos de data en LinkedIn")
    parser.add_argument("--backfill", action="store_true", help="usar backfill_hours (primera corrida)")
    parser.add_argument("--limit", type=int, help="máximo de búsquedas a ejecutar (pruebas)")
    parser.add_argument("--results", type=int, help="resultados por búsqueda (pruebas)")
    parser.add_argument("--skip-scrape", action="store_true", help="solo re-enriquecer y exportar")
    parser.add_argument("--config", default=str(CONFIG_PATH), help="ruta a un config.yaml alternativo")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    with open(args.config, encoding="utf-8") as f:
        config = yaml.safe_load(f)

    conn = storage.connect()

    new = seen = ok = failed = 0
    if not args.skip_scrape:
        hours_old = config["scraping"]["backfill_hours"] if args.backfill else config["scraping"]["hours_old"]
        log.info("Iniciando corrida (hours_old=%d)", hours_old)
        jobs, ok, failed = scraper.run_searches(
            config, hours_old=hours_old, limit=args.limit, results_wanted=args.results
        )
        # Neon cierra conexiones inactivas (~5 min) y el scraping puede tardar más de una hora
        try:
            conn.close()
        except Exception:
            pass
        conn = storage.connect()
        if not jobs.empty:
            snapshot = storage.save_raw_snapshot(jobs)
            log.info("Snapshot crudo: %s (%d filas)", snapshot, len(jobs))
            new, seen = storage.upsert_jobs(conn, jobs)
        else:
            log.warning("La corrida no trajo ninguna vacante")

    enriched = enrich.enrich_all(conn, config)
    df = storage.export_tables(conn)
    export_dashboard.export_data_js(conn)

    log.info(
        "Resumen: búsquedas OK=%d fallidas=%d | vacantes nuevas=%d ya vistas=%d | "
        "base total=%d (enriquecidas=%d)",
        ok, failed, new, seen, len(df), enriched,
    )
    conn.close()


if __name__ == "__main__":
    main()
