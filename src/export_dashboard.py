"""Genera dashboard/data.js con las vacantes enriquecidas (sin descripciones)."""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"

# Campos que necesita el frontend; la descripción se excluye para que
# data.js no pese decenas de MB.
EXPORT_COLUMNS = [
    "id", "title", "company", "location", "country", "city", "region_colombia",
    "work_mode", "role_canonical", "seniority", "years_experience",
    "skills", "salary_min_usd", "salary_max_usd", "salary_mid_usd",
    "date_posted", "first_seen", "last_seen", "job_url", "search_location",
]


def export_data_js(conn: sqlite3.Connection) -> Path:
    df = pd.read_sql(f"SELECT {', '.join(EXPORT_COLUMNS)} FROM jobs", conn)
    df["skills"] = df["skills"].map(lambda s: json.loads(s) if s else [])
    records = df.astype(object).where(pd.notna(df), None).to_dict(orient="records")

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(records),
        "jobs": records,
    }
    DASHBOARD_DIR.mkdir(exist_ok=True)
    path = DASHBOARD_DIR / "data.js"
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.JOBS_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")
    log.info("Dashboard: %d vacantes exportadas a %s", len(records), path)
    return path
