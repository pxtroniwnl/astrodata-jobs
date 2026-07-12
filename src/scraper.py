"""Ejecuta la matriz de búsquedas de config.yaml contra LinkedIn vía jobspy."""

import logging
import random
import time

import pandas as pd
from jobspy import scrape_jobs
from jobspy.model import Country

log = logging.getLogger(__name__)

# jobspy aborta una búsqueda entera si una vacante viene de un país fuera de su
# enum (p. ej. Honduras en búsquedas de "Latin America"). Fallback a WORLDWIDE
# para no perder la búsqueda; el país real se re-infiere en enrich.py.
_orig_from_string = Country.from_string.__func__


def _safe_from_string(cls, country_str: str):
    try:
        return _orig_from_string(cls, country_str)
    except ValueError:
        return cls.WORLDWIDE


Country.from_string = classmethod(_safe_from_string)


def build_search_matrix(config: dict) -> list[dict]:
    """Expande locations × term_groups en una lista de búsquedas individuales."""
    terms = config["search_terms"]
    searches = []
    for loc in config["locations"]:
        for group in loc["term_groups"]:
            for term in terms[group]:
                searches.append(
                    {
                        "search_term": term,
                        "location": loc["name"],
                        "is_remote": loc["is_remote"],
                    }
                )
    return searches


def run_searches(
    config: dict,
    hours_old: int,
    limit: int | None = None,
    results_wanted: int | None = None,
) -> tuple[pd.DataFrame, int, int]:
    """Corre todas las búsquedas y devuelve (jobs, búsquedas_ok, búsquedas_fallidas).

    Una búsqueda fallida (bloqueo, red) no aborta la corrida: se loggea y se sigue.
    """
    scraping = config["scraping"]
    searches = build_search_matrix(config)
    if limit:
        searches = searches[:limit]

    pause_min, pause_max = scraping["pause_seconds"]
    frames: list[pd.DataFrame] = []
    ok = failed = 0

    for i, search in enumerate(searches, start=1):
        label = f"[{i}/{len(searches)}] '{search['search_term']}' en {search['location']}" + (
            " (remoto)" if search["is_remote"] else ""
        )
        log.info("Buscando %s", label)
        try:
            df = scrape_jobs(
                site_name=["linkedin"],
                search_term=search["search_term"],
                location=search["location"],
                is_remote=search["is_remote"],
                results_wanted=results_wanted or scraping["results_wanted"],
                hours_old=hours_old,
                linkedin_fetch_description=scraping["linkedin_fetch_description"],
                description_format="markdown",
                verbose=0,
            )
            n = 0 if df is None else len(df)
            log.info("  -> %d vacantes", n)
            if n:
                df["search_term"] = search["search_term"]
                df["search_location"] = search["location"]
                frames.append(df)
            ok += 1
        except Exception:
            log.warning("  -> falló la búsqueda %s", label, exc_info=True)
            failed += 1

        if i < len(searches):
            time.sleep(random.uniform(pause_min, pause_max))

    jobs = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    return jobs, ok, failed
