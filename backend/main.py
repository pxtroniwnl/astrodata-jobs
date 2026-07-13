"""FastAPI backend for astro-data jobs — CV tailoring + contacts."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.contacts_scraper import (
    build_linkedin_search_urls,
    build_outreach_tips,
    get_networking_checklist,
)
from backend.cv_parser import extract_text
from backend.cv_tailor import tailor_cv
from backend.models import ContactResponse, JobDetail, TailorResponse

app = FastAPI(title="astro-data jobs API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "jobs.db"


def _get_db() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise HTTPException(503, "Base de datos no disponible. Ejecuta el pipeline primero.")
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/api/job/{job_id}")
def get_job(job_id: str) -> JobDetail:
    """Get full job details including description."""
    conn = _get_db()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Vacante {job_id} no encontrada")
        skills = json.loads(row["skills"]) if row["skills"] else []
        return JobDetail(
            id=row["id"],
            title=row["title"] or "",
            company=row["company"] or "",
            location=row["location"],
            country=row["country"],
            city=row["city"],
            work_mode=row["work_mode"],
            role_canonical=row["role_canonical"],
            seniority=row["seniority"],
            skills=skills,
            salary_min_usd=row["salary_min_usd"],
            salary_max_usd=row["salary_max_usd"],
            salary_mid_usd=row["salary_mid_usd"],
            date_posted=row["date_posted"],
            job_url=row["job_url"],
            description=row["description"],
        )
    finally:
        conn.close()


@app.post("/api/tailor-cv")
async def api_tailor_cv(
    file: UploadFile = File(...),
    job_id: str = Form(...),
) -> TailorResponse:
    """Upload a CV file and get tailored analysis for a specific job."""
    if not file.filename:
        raise HTTPException(400, "No se proporcionó archivo")

    # Read job from DB
    conn = _get_db()
    try:
        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"Vacante {job_id} no encontrada")
    finally:
        conn.close()

    # Parse CV
    cv_bytes = await file.read()
    try:
        cv_text = extract_text(cv_bytes, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if len(cv_text.strip()) < 50:
        raise HTTPException(400, "El CV parece estar vacío o no se pudo extraer texto.")

    # Parse skills from DB
    skills = json.loads(row["skills"]) if row["skills"] else []

    # Call Gemini
    try:
        result = tailor_cv(
            cv_text=cv_text,
            job_title=row["title"] or "",
            job_description=row["description"] or "",
            job_skills=skills,
        )
    except RuntimeError as e:
        raise HTTPException(500, f"Error del LLM: {e}")

    return TailorResponse(
        match_score=result.get("match_score", 0),
        summary=result.get("summary", ""),
        tailored_cv=result.get("tailored_cv", ""),
        missing_skills=result.get("missing_skills", []),
        strengths=result.get("strengths", []),
        recommendations=result.get("recommendations", []),
        keywords_to_add=result.get("keywords_to_add", []),
    )


@app.post("/api/contacts")
def api_contacts(
    company: str = Body(..., embed=True),
    job_title: str = Body(..., embed=True),
) -> ContactResponse:
    """Get LinkedIn contact search URLs and outreach tips for a company."""
    search_urls = build_linkedin_search_urls(company)
    tips = build_outreach_tips(company, job_title)
    checklist = get_networking_checklist()

    from backend.models import OutreachTip

    return ContactResponse(
        company=company,
        search_urls=search_urls,
        outreach_tips=[OutreachTip(**t) for t in tips],
        networking_checklist=checklist,
    )


# Serve dashboard static files
DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"
if DASHBOARD_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DASHBOARD_DIR), html=True), name="dashboard")
