# astro-data jobs

[![Open Source](https://img.shields.io/badge/open%20source-%E2%9C%93-71963b?style=flat-square)](CONTRIBUTING.md)
[![Python](https://img.shields.io/badge/python-3.12+-3776ab?style=flat-square)](https://python.org)
[![FastAPI](https://img.shields.io/badge/fastapi-0.115+-009688?style=flat-square)](https://fastapi.tiangolo.com)

> *Como un telescopio escaneando el cielo, detectamos cada oportunidad data que otros no ven.*

Pipeline que extrae diariamente vacantes de LinkedIn en roles de data (Data Engineer,
Data Scientist, Data Analyst, ML/AI Engineer, Analytics Engineer, BI), las acumula
en una base histórica deduplicada y las sirve en un **dashboard interactivo** para
tomar decisiones de carrera: qué rol tiene más demanda, qué skills piden y cuáles
pagan mejor, remoto vs presencial, y en qué ciudades y países se concentra la oferta.

## Nuestra filosofía

**astro-data jobs** nace de una idea simple: buscar empleo como se busca en el cosmos —
con un telescopio que escanea constantemente el cielo, detectando señales que otros
no ven. No es solo un scraper, es un sistema de detección de oportunidades.

Cada vacante es una estrella. Cada skill es una constelación. Y el dashboard es
nuestro mapa del cielo — para que puedas navegar el mercado data con la misma
precisión que un astrónomo navega las estrellas.

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
               dashboard/dashboard.html  ←  abrir en el navegador
               (portada: dashboard/index.html)
```

## Backend API (CV Tailoring + Contactos)

El backend FastAPI ofrece 3 endpoints para la funcionalidad de AI:

```bash
# Instalar dependencias
uv sync

# Arrancar el backend
GEMINI_API_KEY="tu-api-key" uv run uvicorn backend.main:app --port 8000

# Abrir dashboard (se conecta automáticamente al backend)
open http://localhost:8000
```

### Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/job/{id}` | Detalle de una vacante |
| `POST` | `/api/tailor-cv` | Tailoring de CV con Gemini (multipart/form-data) |
| `POST` | `/api/contacts` | URLs de búsqueda LinkedIn para contactos |

**CV Tailoring**: Sube tu CV (PDF/DOCX) + ID de vacante → Gemini analiza y sugiere ajustes específicos.
**Contactos**: Dado el ID de una vacante, genera URLs de búsqueda LinkedIn + checklist de outreach.

## Uso del pipeline

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

## Estructura del proyecto

```
astrodata-jobs/
├── backend/                 # FastAPI — CV tailoring + contactos
│   ├── main.py              # App FastAPI, 3 endpoints, sirve dashboard
│   ├── cv_parser.py         # Extracción de texto de PDF/DOCX
│   ├── cv_tailor.py         # Tailoring con Gemini (fallback de modelos)
│   ├── contacts_scraper.py  # URLs de búsqueda LinkedIn + outreach tips
│   └── models.py            # Schemas Pydantic
├── dashboard/               # Frontend HTML/CSS/JS
│   ├── index.html           # Landing page
│   ├── dashboard.html       # Dashboard interactivo
│   ├── roadmaps.html        # Roadmaps de aprendizaje
│   ├── styles.css           # Estilos del dashboard
│   ├── landing.css          # Estilos de la landing
│   ├── roadmaps.css         # Estilos de roadmaps
│   ├── app.js               # Lógica del dashboard
│   ├── job-detail.js        # Modal de detalle + CV upload
│   ├── roadmaps.js          # Lógica de roadmaps
│   └── data/roadmaps.json   # Datos de roadmaps (5 roles)
├── src/                     # Pipeline de scraping y enriquecimiento
├── config.yaml              # Configuración del pipeline
├── data/                    # Datos acumulados (jobs.db, parquet, csv)
└── CONTRIBUTING.md          # Guía de contribución
```

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

## Contribuir

Este es un proyecto open source. Si quieres contribuir, corrregir algo, o proponer
mejoras, revisa la [guía de contribución](CONTRIBUTING.md).

Áreas abiertas: nuevo backend, roadmaps, animaciones, scraping, docs, traducciones.

## Limitaciones conocidas

- El scraping de LinkedIn va contra sus ToS; este proyecto es de uso
  personal/educativo, con pausas y volumen moderado para no abusar.
- Solo una minoría de ofertas publica salario: las métricas salariales usan ese
  subconjunto y se marcan como referencia.
- Skills/seniority/experiencia se extraen con reglas (regex) sobre el texto.
- CV tailoring usa Gemini free tier — puede tener límites de rate.

## Licencia

Uso personal/educativo. No es un servicio comercial.
