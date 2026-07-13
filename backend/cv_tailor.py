"""CV tailoring via Google Gemini (free tier)."""
from __future__ import annotations

import json
import os
import time

from google import genai
from google.genai import types

MODELS = ["gemini-3-flash-preview", "gemini-2.0-flash", "gemini-2.0-flash-001"]

SYSTEM_PROMPT = """\
Eres un experto en recursos humanos y optimización de CVs para el sector de datos y tecnología.

Tu tarea: analizar un CV junto con la descripción de una vacante y devolver un análisis estructurado.

Responde SIEMPRE con JSON válido con esta estructura exacta:
{
  "match_score": 75,
  "summary": "Breve resumen del match entre el CV y la vacante",
  "tailored_cv": "CV optimizado reestructurado para esta vacante específica, manteniendo la info real del candidato pero reordenando y enfatizando lo relevante",
  "missing_skills": ["skill1", "skill2"],
  "strengths": ["fortaleza1", "fortaleza2"],
  "recommendations": [
    "Recomendación específica 1",
    "Recomendación específica 2"
  ],
  "keywords_to_add": ["keyword1", "keyword2"]
}

Reglas:
- match_score: 0-100, basado en skills, experiencia y seniority
- tailored_cv: reescribe el CV completo optimizado para esta vacante, en el mismo idioma del CV original
- missing_skills: skills que pide la vacante y no están en el CV
- strengths: qué del CV coincide bien con la vacante
- recommendations: 3-5 acciones concretas para mejorar la aplicación
- keywords_to_add: palabras clave del ATS que deberían aparecer en el CV
"""


def tailor_cv(cv_text: str, job_title: str, job_description: str, job_skills: list[str]) -> dict:
    """Send CV + job info to Gemini and return structured tailoring analysis."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY no configurada. Exporta la variable de entorno.")

    client = genai.Client(api_key=api_key)

    user_prompt = f"""\
VACANTE:
Título: {job_title}
Skills requeridas: {', '.join(job_skills)}

Descripción completa:
{job_description}

--- CV DEL CANDIDATO ---
{cv_text}
--- FIN DEL CV ---

Analiza el CV contra esta vacante y devuelve el JSON con el análisis estructurado."""

    last_error = None
    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.3,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )

            raw = response.text
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start >= 0 and end > start:
                    return json.loads(raw[start:end])
                raise RuntimeError(f"No se pudo parsear la respuesta del LLM: {raw[:200]}")
        except Exception as e:
            last_error = e
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                time.sleep(2)
                continue
            raise

    raise RuntimeError(f"Todos los modelos agotados. Último error: {last_error}")
