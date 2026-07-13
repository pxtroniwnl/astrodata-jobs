"""Find LinkedIn contacts at a company for networking."""
from __future__ import annotations

import re
from urllib.parse import quote_plus


def build_linkedin_search_urls(company: str) -> dict[str, str]:
    """Build pre-formed LinkedIn search URLs for different HR roles at a company."""
    encoded = quote_plus(company)
    return {
        "talent_acquisition": f"https://www.linkedin.com/search/results/people/?keywords=Talent%20Acquisition%20{encoded}&origin=GLOBAL_SEARCH_HEADER",
        "recruiter": f"https://www.linkedin.com/search/results/people/?keywords=Recruiter%20{encoded}&origin=GLOBAL_SEARCH_HEADER",
        "hr_manager": f"https://www.linkedin.com/search/results/people/?keywords=HR%20Manager%20{encoded}&origin=GLOBAL_SEARCH_HEADER",
        "people_ops": f"https://www.linkedin.com/search/results/people/?keywords=People%20Operations%20{encoded}&origin=GLOBAL_SEARCH_HEADER",
        "hiring_manager": f"https://www.linkedin.com/search/results/people/?keywords=Hiring%20Manager%20Data%20{encoded}&origin=GLOBAL_SEARCH_HEADER",
        "company_page": f"https://www.linkedin.com/company/{_slugify(company)}/people/",
    }


def _slugify(name: str) -> str:
    """Convert company name to LinkedIn slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s]+", "-", slug)
    slug = slug.strip("-")
    return slug


def build_outreach_tips(company: str, role_title: str) -> list[dict[str, str]]:
    """Generate outreach tips and message templates."""
    return [
        {
            "title": "Conexión directa",
            "template": (
                f"Hola [Nombre], vi la posición de {role_title} en {company} "
                "y me encantaría conectar. Tengo experiencia en [tu experiencia relevante] "
                "y me parece muy interesante el equipo que están armando. "
                "¿Podríamos conversar brevemente sobre el rol?"
            ),
            "tip": "Mantén el mensaje corto (3-4 líneas). Personaliza mencionando algo específico de la empresa.",
        },
        {
            "title": "Referido por contacto mutuo",
            "template": (
                f"Hola [Nombre], [Contacto mutuo] me recomendó contactarte. "
                f"Estoy muy interesado en las oportunidades de datos en {company} "
                "y me gustaría aprender sobre la cultura del equipo. "
                "¿Tienes 15 minutos para una charla rápida?"
            ),
            "tip": "Los referrals aumentan las probabilidades de respuesta hasta 10x. Busca conexiones mutuales primero.",
        },
        {
            "title": "Valor primero",
            "template": (
                f"Hola [Nombre], noté que {company} está [algo que la empresa hizo recientemente]. "
                "Como especialista en datos, tengo algunas ideas sobre [área relevante]. "
                f"Me encantaría compartir mi perspectiva. ¿Te gustaría conversar?"
            ),
            "tip": "Ofrece valor antes de pedir algo. Menciona un logro reciente de la empresa o un artículo del blog.",
        },
    ]


def get_networking_checklist() -> list[dict[str, str]]:
    """Return a networking checklist for job seekers."""
    return [
        {"step": "Optimizar tu perfil de LinkedIn", "description": "Foto profesional, headline con keywords, resumen actualizado"},
        {"step": "Identificar la empresa objetivo", "description": "Investiga tamaño, tecnología stack, cultura, recientes hiring posts"},
        {"step": "Encontrar hiring manager", "description": "Busca al manager del equipo donde quieres entrar, no solo HR"},
        {"step": "Conectar con empleados actuales", "description": "Personas en roles similares al que buscan, pueden dar referral interno"},
        {"step": "Personalizar cada mensaje", "description": "Nada de mensajes genéricos. Menciona algo específico de la empresa o persona"},
        {"step": "Seguimiento a los 5 días", "description": "Si no responden, un follow-up corto y educado después de 5 días hábiles"},
        {"step": "Preparar tu pitch", "description": "30 segundos sobre quién eres, qué haces, y por qué esta empresa te interesa"},
    ]
