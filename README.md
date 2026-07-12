# Radar de Empleos Data

Pipeline que extrae diariamente vacantes de LinkedIn en roles de data (Data Engineer,
Data Scientist, Data Analyst, ML/AI Engineer, Analytics Engineer, BI), las acumula
en una base histórica deduplicada y las sirve en un **dashboard interactivo** para
tomar decisiones de carrera: qué rol tiene más demanda, qué skills piden y cuáles
pagan mejor, remoto vs presencial, y cómo se compara Bogotá vs Medellín vs la Costa.

## Cómo funciona

```
config.yaml ──> src/scraper.py (jobspy → LinkedIn)
                     │  matriz términos × ubicaciones, pausas anti-bloqueo
                     ▼
               src/storage.py (SQLite data/jobs.db)
                     │  dedup por job id, first_seen / last_seen
                     ▼
               src/enrich.py
                     │  skills, rol canónico, seniority, años de experiencia,
                     │  región de Colombia, salario normalizado a USD/año
                     ▼
               exports: data/jobs.parquet · data/jobs.csv · dashboard/data.js
                     ▼
               dashboard/index.html  ←  abrir en el navegador
```

Alcance de búsqueda: **Colombia** (presencial y remoto) + **remoto** en LATAM,
EE.UU. y mundial. Términos en inglés y español (ver `config.yaml`).

## Uso

```bash
# Corrida diaria manual (vacantes de las últimas 24 h)
uv run python -m src.main

# Primera corrida / recuperar una semana
uv run python -m src.main --backfill

# Prueba rápida (2 búsquedas, 10 resultados c/u)
uv run python -m src.main --limit 2 --results 10

# Re-enriquecer y regenerar exports sin scrapear
uv run python -m src.main --skip-scrape
```

Dashboard: abrir `dashboard/index.html` en el navegador (doble clic; no necesita
servidor). Se regenera con cada corrida del pipeline.

## Corrida automática (cron)

```cron
0 9 * * * /ruta/al/proyecto/run_pipeline.sh
```

Los logs quedan en `logs/pipeline_YYYY-MM-DD.log`.

## Estructura de datos

- `data/jobs.db` — SQLite consolidado; una fila por vacante única, con
  `first_seen`/`last_seen` para medir permanencia.
- `data/jobs.parquet` / `data/jobs.csv` — export plano para análisis con pandas.
- `data/raw/*.parquet` — snapshot crudo de cada corrida.

## Limitaciones conocidas

- El scraping de LinkedIn va contra sus ToS; este proyecto es de uso
  personal/educativo, con pausas y volumen moderado para no abusar. Si una corrida
  se bloquea, las búsquedas fallidas se registran y la siguiente corrida recupera.
- Solo una minoría de ofertas publica salario: las métricas salariales usan ese
  subconjunto y se marcan como referencia.
- Skills/seniority/experiencia se extraen con reglas (regex) sobre el texto: hay
  margen de error; las reglas viven en `src/enrich.py` y se re-aplican a todo el
  histórico en cada corrida, así que mejorarlas mejora también los datos viejos.
