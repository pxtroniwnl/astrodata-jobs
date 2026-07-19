"""CV tailoring via Google Gemini (free tier)."""
from __future__ import annotations

import json
import os
import time

from google import genai
from google.genai import types

from backend.cv_pdf import struct_to_text, validate_cv_struct

MODELS = ["gemini-3-flash-preview", "gemini-2.0-flash", "gemini-2.0-flash-001"]

SYSTEM_PROMPT = """\
Eres un experto en recursos humanos y optimización de CVs para el sector de datos y tecnología.

Tu tarea: analizar un CV junto con la descripción de una vacante y devolver un análisis estructurado.

Responde SIEMPRE con JSON válido con esta estructura exacta:
{
  "match_score": 75,
  "optimized_score": 88,
  "summary": "Breve resumen del match entre el CV y la vacante",
  "cv_struct": {
    "name": "NOMBRE COMPLETO",
    "contact": "email | teléfono | ciudad | linkedin",
    "sections": [
      {"title": "Perfil", "type": "paragraph", "content": "..."},
      {"title": "Experiencia", "type": "entries", "entries": [
        {"heading": "Cargo — Empresa", "meta": "Ciudad · 2022–Presente",
         "bullets": ["logro cuantificado con keywords de la vacante"]}
      ]},
      {"title": "Educación", "type": "entries", "entries": [
        {"heading": "Título — Institución", "meta": "2018–2022", "bullets": []}
      ]},
      {"title": "Competencias", "type": "paragraph", "content": "Grupo: a, b, c"}
    ]
  },
  "missing_skills": ["skill1", "skill2"],
  "strengths": ["fortaleza1", "fortaleza2"],
  "recommendations": [
    "Recomendación específica 1",
    "Recomendación específica 2"
  ],
  "keywords_to_add": ["keyword1", "keyword2"]
}

Reglas:
- match_score: 0-100, puntuación del CV ORIGINAL tal como fue enviado, basado en
  skills, experiencia y seniority
- optimized_score: 0-100, puntuación que tendría el cv_struct optimizado contra la
  misma vacante. Sé realista: mejora por keywords y reordenamiento, pero las skills
  que faltan (missing_skills) siguen limitando el score — no des ~100 si faltan
  skills clave. Normalmente optimized_score >= match_score.
- cv_struct: el CV completo optimizado, estructurado para maquetar en UNA página:
  - ESCRÍBELO EN EL IDIOMA DE LA DESCRIPCIÓN DE LA VACANTE (vacante en inglés → CV en inglés).
  - Usa SOLO información real del CV original: reformula y reordena con los términos
    de la vacante, integra keywords defendibles en Competencias, pero NUNCA inventes
    empleos, proyectos, títulos ni skills que el candidato no tenga. Las skills que
    le faltan van solo en missing_skills/recommendations, no en el CV.
  - Conserva los datos de contacto del CV original en "contact".
  - Sé conciso: máximo 4 bullets por empleo, para que quepa en una página.
  - Los títulos de sección también en el idioma de la vacante.
- missing_skills: skills que pide la vacante y no están en el CV
- strengths: qué del CV coincide bien con la vacante
- recommendations: 3-5 acciones concretas para mejorar la aplicación
- keywords_to_add: palabras clave del ATS que deberían aparecer en el CV
"""


def _score_or_none(value) -> int | None:
    """Convierte a int acotado a 0-100; None si no es numérico."""
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return None


def _finalize(parsed: dict) -> dict:
    """Valida cv_struct, deriva el texto plano para la UI y sanea los scores."""
    struct = validate_cv_struct(parsed.get("cv_struct"))
    if struct:
        parsed["cv_struct"] = struct
        parsed["tailored_cv"] = struct_to_text(struct)
    else:
        parsed["cv_struct"] = None
        parsed.setdefault("tailored_cv", "")

    parsed["match_score"] = _score_or_none(parsed.get("match_score")) or 0
    # Sin CV optimizado válido no hay nada que puntuar.
    parsed["optimized_score"] = (
        _score_or_none(parsed.get("optimized_score")) if struct else None
    )
    return parsed


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
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )

            raw = response.text
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                start = raw.find("{")
                end = raw.rfind("}") + 1
                if start >= 0 and end > start:
                    parsed = json.loads(raw[start:end])
                else:
                    raise RuntimeError(f"No se pudo parsear la respuesta del LLM: {raw[:200]}")
            return _finalize(parsed)
        except Exception as e:
            last_error = e
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                time.sleep(2)
                continue
            raise

    raise RuntimeError(f"Todos los modelos agotados. Último error: {last_error}")
