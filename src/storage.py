"""Persistencia: PostgreSQL (Neon) deduplicado por job id + snapshots y exports."""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import psycopg2
import psycopg2.extras

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"

JOBSPY_COLUMNS = [
    "id", "site", "job_url", "title", "company", "location", "is_remote",
    "job_type", "job_level", "date_posted", "interval", "min_amount",
    "max_amount", "currency", "salary_source", "description",
    "company_industry", "search_term", "search_location",
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    site TEXT,
    job_url TEXT,
    title TEXT,
    company TEXT,
    location TEXT,
    is_remote INTEGER,
    job_type TEXT,
    job_level TEXT,
    date_posted TEXT,
    interval TEXT,
    min_amount DOUBLE PRECISION,
    max_amount DOUBLE PRECISION,
    currency TEXT,
    salary_source TEXT,
    description TEXT,
    company_industry TEXT,
    search_term TEXT,
    search_location TEXT,
    first_seen TEXT,
    last_seen TEXT,
    role_canonical TEXT,
    seniority TEXT,
    years_experience DOUBLE PRECISION,
    skills TEXT,
    country TEXT,
    city TEXT,
    region_colombia TEXT,
    work_mode TEXT,
    salary_min_usd DOUBLE PRECISION,
    salary_max_usd DOUBLE PRECISION,
    salary_mid_usd DOUBLE PRECISION
);
"""


def _get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL no configurada. Ejemplo:\n"
            "  export DATABASE_URL='postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require'"
        )
    return url


def connect():
    conn = psycopg2.connect(_get_database_url())
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute(SCHEMA)
    conn.commit()
    return conn


def save_raw_snapshot(jobs: pd.DataFrame) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    path = RAW_DIR / f"{stamp}.parquet"
    jobs.to_parquet(path, index=False)
    return path


def upsert_jobs(conn, jobs: pd.DataFrame) -> tuple[int, int]:
    if jobs.empty:
        return 0, 0

    df = jobs.copy()
    df = df.drop_duplicates(subset=["id"])
    for col in JOBSPY_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[JOBSPY_COLUMNS]
    df["date_posted"] = df["date_posted"].astype(str).replace({"None": None, "NaT": None, "nan": None})
    df["is_remote"] = df["is_remote"].map(lambda v: None if pd.isna(v) else int(bool(v)))
    df = df.astype(object).where(pd.notna(df), None)

    today = datetime.now(timezone.utc).date().isoformat()

    cur = conn.cursor()
    cur.execute("SELECT id FROM jobs")
    existing = {row[0] for row in cur.fetchall()}

    cols = JOBSPY_COLUMNS + ["first_seen", "last_seen"]
    placeholders = ", ".join(["%s"] * len(cols))
    col_names = ", ".join(cols)
    sql = f"""
        INSERT INTO jobs ({col_names}) VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET last_seen = EXCLUDED.last_seen
    """
    rows = [tuple(rec) + (today, today) for rec in df.itertuples(index=False)]
    psycopg2.extras.execute_batch(cur, sql, rows, page_size=500)
    conn.commit()

    new = sum(1 for r in df["id"] if r not in existing)
    return new, len(df) - new


def export_tables(conn) -> pd.DataFrame:
    df = pd.read_sql("SELECT * FROM jobs", conn)
    df.to_parquet(DATA_DIR / "jobs.parquet", index=False)
    df.to_csv(DATA_DIR / "jobs.csv", index=False)
    return df
