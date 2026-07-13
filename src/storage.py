"""Persistencia: SQLite deduplicado por job id + snapshots y exports para análisis."""

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "jobs.db"
RAW_DIR = DATA_DIR / "raw"

# Columnas de jobspy que persistimos (el resto se descarta)
JOBSPY_COLUMNS = [
    "id",
    "site",
    "job_url",
    "title",
    "company",
    "location",
    "is_remote",
    "job_type",
    "job_level",
    "date_posted",
    "interval",
    "min_amount",
    "max_amount",
    "currency",
    "salary_source",
    "description",
    "company_industry",
    "search_term",
    "search_location",
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
    min_amount REAL,
    max_amount REAL,
    currency TEXT,
    salary_source TEXT,
    description TEXT,
    company_industry TEXT,
    search_term TEXT,
    search_location TEXT,
    first_seen TEXT,
    last_seen TEXT,
    -- columnas de enriquecimiento (las llena src/enrich.py)
    role_canonical TEXT,
    seniority TEXT,
    years_experience REAL,
    skills TEXT,
    country TEXT,
    city TEXT,
    region_colombia TEXT,
    work_mode TEXT,
    salary_min_usd REAL,
    salary_max_usd REAL,
    salary_mid_usd REAL
);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(SCHEMA)
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    # Columnas añadidas después de que existieran bases ya creadas
    existing = {row[1] for row in conn.execute("PRAGMA table_info(jobs)")}
    if "city" not in existing:
        conn.execute("ALTER TABLE jobs ADD COLUMN city TEXT")
        conn.commit()


def save_raw_snapshot(jobs: pd.DataFrame) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    path = RAW_DIR / f"{stamp}.parquet"
    jobs.to_parquet(path, index=False)
    return path


def upsert_jobs(conn: sqlite3.Connection, jobs: pd.DataFrame) -> tuple[int, int]:
    """Inserta vacantes nuevas y actualiza last_seen de las ya vistas.

    Devuelve (nuevas, ya_vistas).
    """
    if jobs.empty:
        return 0, 0

    df = jobs.copy()
    # Una misma vacante puede salir en varias búsquedas de la corrida
    df = df.drop_duplicates(subset=["id"])
    for col in JOBSPY_COLUMNS:
        if col not in df.columns:
            df[col] = None
    df = df[JOBSPY_COLUMNS]
    df["date_posted"] = df["date_posted"].astype(str).replace({"None": None, "NaT": None, "nan": None})
    df["is_remote"] = df["is_remote"].map(lambda v: None if pd.isna(v) else int(bool(v)))
    df = df.astype(object).where(pd.notna(df), None)

    today = datetime.now(timezone.utc).date().isoformat()
    existing = {
        row[0] for row in conn.execute("SELECT id FROM jobs").fetchall()
    }

    placeholders = ", ".join(["?"] * (len(JOBSPY_COLUMNS) + 2))
    cols = ", ".join(JOBSPY_COLUMNS + ["first_seen", "last_seen"])
    sql = f"""
        INSERT INTO jobs ({cols}) VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen
    """
    rows = [tuple(rec) + (today, today) for rec in df.itertuples(index=False)]
    conn.executemany(sql, rows)
    conn.commit()

    new = sum(1 for r in df["id"] if r not in existing)
    return new, len(df) - new


def export_tables(conn: sqlite3.Connection) -> pd.DataFrame:
    """Exporta la base completa a parquet y CSV; devuelve el DataFrame."""
    df = pd.read_sql("SELECT * FROM jobs", conn)
    df.to_parquet(DATA_DIR / "jobs.parquet", index=False)
    df.to_csv(DATA_DIR / "jobs.csv", index=False)
    return df
