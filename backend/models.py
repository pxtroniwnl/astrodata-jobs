"""Pydantic models for API request/response."""
from __future__ import annotations

from pydantic import BaseModel


class TailorRequest(BaseModel):
    job_id: str
    cv_text: str | None = None


class TailorResponse(BaseModel):
    match_score: int
    summary: str
    tailored_cv: str
    missing_skills: list[str]
    strengths: list[str]
    recommendations: list[str]
    keywords_to_add: list[str]
    cv_struct: dict | None = None


class ContactRequest(BaseModel):
    company: str
    job_title: str


class ContactRole(BaseModel):
    role: str
    url: str


class OutreachTip(BaseModel):
    title: str
    template: str
    tip: str


class ContactResponse(BaseModel):
    company: str
    search_urls: dict[str, str]
    outreach_tips: list[OutreachTip]
    networking_checklist: list[dict[str, str]]


class JobDetail(BaseModel):
    id: str
    title: str
    company: str
    location: str | None
    country: str | None
    city: str | None
    work_mode: str | None
    role_canonical: str | None
    seniority: str | None
    skills: list[str]
    salary_min_usd: float | None
    salary_max_usd: float | None
    salary_mid_usd: float | None
    date_posted: str | None
    job_url: str | None
    description: str | None
