"""Enriquecimiento: skills, rol canónico, seniority, ciudad, región de Colombia y salario USD.

Corre sobre toda la base después de cada upsert, así las reglas se pueden
mejorar y re-aplicar al histórico completo.
"""

import json
import logging
import re
import unicodedata

import pandas as pd

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Skills: nombre canónico -> regex (sobre título + descripción en minúsculas,
# salvo los case-sensitive marcados). Word boundaries para evitar falsos
# positivos tipo "r" dentro de otra palabra.
# ---------------------------------------------------------------------------
SKILL_PATTERNS: dict[str, str] = {
    # Lenguajes
    "Python": r"\bpython\b",
    "SQL": r"\bsql\b",
    "R": r"(?<![a-zA-Z])R(?![a-zA-Z+#])",  # se evalúa case-sensitive aparte
    "Scala": r"\bscala\b",
    "Java": r"\bjava\b(?!script)",
    "C++": r"c\+\+",
    "Go": r"\bgolang\b|(?<![a-zA-Z])Go(?![a-zA-Z])",  # case-sensitive aparte
    "JavaScript": r"\bjavascript\b|\btypescript\b",
    "Bash": r"\bbash\b|\bshell scripting\b",
    # Procesamiento / orquestación
    "Spark": r"\bspark\b|\bpyspark\b",
    "Hadoop": r"\bhadoop\b",
    "Kafka": r"\bkafka\b",
    "Flink": r"\bflink\b",
    "Airflow": r"\bairflow\b",
    "dbt": r"\bdbt\b",
    "ETL": r"\betl\b|\belt\b",
    "NiFi": r"\bnifi\b",
    "SSIS": r"\bssis\b",
    "Informatica": r"\binformatica\b",
    "Talend": r"\btalend\b",
    # Data warehouses / lakes
    "Snowflake": r"\bsnowflake\b",
    "Databricks": r"\bdatabricks\b",
    "BigQuery": r"\bbig ?query\b",
    "Redshift": r"\bredshift\b",
    "Synapse": r"\bsynapse\b",
    "Microsoft Fabric": r"\bmicrosoft fabric\b|\bms fabric\b",
    "Hive": r"\bhive\b",
    # Cloud
    "AWS": r"\baws\b|\bamazon web services\b",
    "Azure": r"\bazure\b",
    "GCP": r"\bgcp\b|\bgoogle cloud\b",
    # DevOps / infra
    "Docker": r"\bdocker\b",
    "Kubernetes": r"\bkubernetes\b|\bk8s\b",
    "Terraform": r"\bterraform\b",
    "Git": r"\bgit\b(?!hub|lab)",
    "CI/CD": r"\bci/cd\b|\bcicd\b",
    "Linux": r"\blinux\b",
    # Bases de datos
    "PostgreSQL": r"\bpostgres(?:ql)?\b",
    "MySQL": r"\bmysql\b",
    "SQL Server": r"\bsql server\b",
    "Oracle": r"\boracle\b",
    "MongoDB": r"\bmongo ?db\b",
    "Cassandra": r"\bcassandra\b",
    "Elasticsearch": r"\belastic ?search\b",
    "Redis": r"\bredis\b",
    "DynamoDB": r"\bdynamodb\b",
    # BI / visualización
    "Power BI": r"\bpower ?bi\b",
    "Tableau": r"\btableau\b",
    "Looker": r"\blooker\b",
    "Qlik": r"\bqlik\b",
    "Excel": r"\bexcel\b",
    # ML / ciencia de datos
    "Pandas": r"\bpandas\b",
    "NumPy": r"\bnumpy\b",
    "scikit-learn": r"\bscikit[- ]?learn\b|\bsklearn\b",
    "TensorFlow": r"\btensorflow\b",
    "PyTorch": r"\bpytorch\b",
    "Keras": r"\bkeras\b",
    "MLOps": r"\bmlops\b",
    "MLflow": r"\bmlflow\b",
    "NLP": r"\bnlp\b|\bnatural language processing\b",
    "Computer Vision": r"\bcomputer vision\b|\bvisión por computador",
    "LLMs / GenAI": r"\bllms?\b|\bgenerative ai\b|\bgen ?ai\b|\blangchain\b|\brag\b",
    "A/B Testing": r"\ba/b test",
    "Estadística": r"\bstatistic|\bestadístic",
    # Otros
    "SAS": r"\bsas\b",
    "SPSS": r"\bspss\b",
    "MATLAB": r"\bmatlab\b",
    "FastAPI": r"\bfastapi\b",
    "Streamlit": r"\bstreamlit\b",
}
CASE_SENSITIVE_SKILLS = {"R", "Go"}
_COMPILED_SKILLS = {
    name: re.compile(pat, 0 if name in CASE_SENSITIVE_SKILLS else re.IGNORECASE)
    for name, pat in SKILL_PATTERNS.items()
}

# Rol canónico: se evalúan en orden, gana el primero que matchee el título
ROLE_RULES: list[tuple[str, str]] = [
    ("ML/AI Engineer", r"machine learning|ml engineer|mlops|ai engineer|\bai agent\b|agentic|artificial intelligence|inteligencia artificial|deep learning|computer vision|llm|genai|gen ai"),
    ("Analytics Engineer", r"analytics engineer"),
    ("Data Engineer", r"data engineer|data software engineer|ingenier[oa]? de datos|ingenier[ií]a de datos|etl developer|big data|database (?:engineer|administrator|developer)"),
    ("Data Scientist", r"data scien|cient[ií]fic[oa]? de datos|ciencia de datos"),
    ("BI", r"business intelligence|\bbi\b|power ?bi|inteligencia de negocios"),
    ("Data Analyst", r"data analyst|analista de datos|an[aá]lisis de datos|analytics analyst|data analytics|insights? analyst|product analyst|analytics specialist"),
    ("Data Architect", r"data architect|arquitect[oa] de datos"),
]
_COMPILED_ROLES = [(name, re.compile(pat, re.IGNORECASE)) for name, pat in ROLE_RULES]

_JUNIOR_RE = re.compile(r"\bjunior\b|\bjr\.?\b|\bintern(?:ship)?\b|\btrainee\b|\bpracticante\b|\bpr[aá]ctica\b|\bentry[- ]level\b|\baprendiz\b", re.IGNORECASE)
_LEAD_RE = re.compile(r"\blead\b|\bprincipal\b|\bstaff\b|\bhead of\b|\bmanager\b|\bdirector\b|\bl[ií]der\b|\bjefe\b", re.IGNORECASE)
_SENIOR_RE = re.compile(r"\bsenior\b|\bsr\.?\b|\bexpert[oa]?\b", re.IGNORECASE)
_MID_RE = re.compile(r"\bssr\.?\b|\bsemi[- ]?senior\b|\bmid[- ]?level\b|\bintermediate\b", re.IGNORECASE)

# "3+ years", "2-4 años", "mínimo 5 años de experiencia", "5 years of experience"
_YEARS_RANGE_RE = re.compile(r"(\d{1,2})\s*(?:-|–|a|to)\s*(\d{1,2})\s*(?:\+\s*)?(?:years?|a[ñn]os?|yrs?)", re.IGNORECASE)
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years?|a[ñn]os?|yrs?)(?:\s+(?:of|de))?\s*(?:\w+\s+){0,3}?(?:experience|experiencia)", re.IGNORECASE)
_YEARS_ES_RE = re.compile(r"experiencia\s+(?:m[ií]nima\s+)?(?:de\s+)?(\d{1,2})\s*\+?\s*a[ñn]os", re.IGNORECASE)

# Regiones de Colombia por ciudad/departamento en el campo location
COLOMBIA_REGIONS: list[tuple[str, str]] = [
    ("Bogotá", r"bogot|cundinamarca|capital district|cha[ií]a|soacha|zipaquir"),
    ("Medellín / Antioquia", r"medell|antioquia|envigado|itag[uü]|sabaneta|rionegro|bello"),
    ("Costa Caribe", r"barranquilla|cartagena|santa marta|monter[ií]a|sincelejo|valledupar|riohacha|soledad|atl[aá]ntico|bol[ií]var|magdalena|c[oó]rdoba|cesar|guajira|sucre"),
    ("Cali / Valle", r"\bcali\b|valle del cauca|palmira|yumbo|buenaventura"),
    ("Eje Cafetero", r"pereira|manizales|armenia|quind[ií]o|risaralda|caldas"),
    ("Santanderes", r"bucaramanga|c[uú]cuta|floridablanca|norte de santander|,\s*santander\b"),
]
_COMPILED_REGIONS = [(name, re.compile(pat, re.IGNORECASE)) for name, pat in COLOMBIA_REGIONS]

_HYBRID_RE = re.compile(r"\bh[ií]brid[oa]?\b|\bhybrid\b", re.IGNORECASE)
_REMOTE_RE = re.compile(r"\bremot[oe]a?\b|\bwork from home\b|\bteletrabajo\b|\bhome office\b", re.IGNORECASE)

_INTERVAL_TO_YEARLY = {
    "yearly": 1,
    "monthly": 12,
    "weekly": 52,
    "daily": 260,
    "hourly": 2080,
}

# Países que LinkedIn suele poner al final de location; fallback: search_location
_KNOWN_COUNTRIES = {
    "colombia": "Colombia", "mexico": "México", "méxico": "México",
    "argentina": "Argentina", "brazil": "Brasil", "brasil": "Brasil",
    "chile": "Chile", "peru": "Perú", "perú": "Perú", "ecuador": "Ecuador",
    "uruguay": "Uruguay", "paraguay": "Paraguay", "bolivia": "Bolivia",
    "venezuela": "Venezuela", "costa rica": "Costa Rica", "panama": "Panamá",
    "panamá": "Panamá", "guatemala": "Guatemala", "honduras": "Honduras",
    "el salvador": "El Salvador", "nicaragua": "Nicaragua",
    "dominican republic": "Rep. Dominicana", "puerto rico": "Puerto Rico",
    "united states": "Estados Unidos", "usa": "Estados Unidos",
    "canada": "Canadá", "spain": "España", "españa": "España",
    "united kingdom": "Reino Unido", "germany": "Alemania", "india": "India",
}


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# Primer segmento de location -> ciudad canónica. Claves sin acentos y en
# minúsculas; unifica variantes que LinkedIn mezcla ("Medellin"/"Medellín").
_CITY_ALIASES = {
    "bogota": "Bogotá",
    "bogota d.c.": "Bogotá",
    "bogota d.c": "Bogotá",
    "santa fe de bogota": "Bogotá",
    "medellin": "Medellín",
    "cancun": "Cancún",
    "mexico city": "Ciudad de México",
    "ciudad de mexico": "Ciudad de México",
    "cdmx": "Ciudad de México",
    "sao paulo": "São Paulo",
    "asuncion": "Asunción",
    "brasilia": "Brasilia",
}

_COUNTRY_KEYS = {_strip_accents(k) for k in _KNOWN_COUNTRIES}

# Primeros segmentos que no son una ciudad
_NON_CITY_KEYS = _COUNTRY_KEYS | {"remote", "remoto", "latin america", "south america", "worldwide"}


def extract_city(location: str) -> str | None:
    """Ciudad = primer segmento de location ("Medellín, Antioquia, Colombia").

    Devuelve None si no hay location o el segmento es un país/placeholder,
    no una ciudad (p. ej. location == "Colombia").
    """
    seg = (location or "").split(",")[0].strip()
    if not seg:
        return None
    key = _strip_accents(seg.lower())
    if key in _CITY_ALIASES:
        return _CITY_ALIASES[key]
    if key in _NON_CITY_KEYS:
        return None
    return seg


def extract_skills(text: str) -> list[str]:
    return [name for name, rx in _COMPILED_SKILLS.items() if rx.search(text)]


def canonical_role(title: str) -> str:
    for name, rx in _COMPILED_ROLES:
        if rx.search(title):
            return name
    return "Otro"


def extract_years(text: str) -> float | None:
    candidates: list[int] = []
    for m in _YEARS_RANGE_RE.finditer(text):
        candidates.append(int(m.group(1)))
    for m in _YEARS_RE.finditer(text):
        candidates.append(int(m.group(1)))
    for m in _YEARS_ES_RE.finditer(text):
        candidates.append(int(m.group(1)))
    candidates = [c for c in candidates if 0 < c <= 15]
    return float(min(candidates)) if candidates else None


def seniority(title: str, description: str, years: float | None) -> str:
    # El título manda; la descripción y los años son fallback
    for rx, label in ((_LEAD_RE, "Lead+"), (_SENIOR_RE, "Senior"), (_MID_RE, "Mid"), (_JUNIOR_RE, "Junior")):
        if rx.search(title):
            return label
    if years is not None:
        if years < 2:
            return "Junior"
        if years < 5:
            return "Mid"
        return "Senior"
    if _JUNIOR_RE.search(description):
        return "Junior"
    if _SENIOR_RE.search(description):
        return "Senior"
    return "No especificado"


def infer_country(location: str, search_location: str) -> str:
    loc = (location or "").lower()
    for key, name in _KNOWN_COUNTRIES.items():
        if key in loc:
            return name
    sl = (search_location or "").lower()
    for key, name in _KNOWN_COUNTRIES.items():
        if key in sl:
            return name
    if "latin america" in sl:
        return "LATAM (sin especificar)"
    if "worldwide" in sl:
        return "Global (sin especificar)"
    return "Otro"


def colombia_region(location: str, country: str, work_mode: str) -> str | None:
    if country != "Colombia":
        return None
    for name, rx in _COMPILED_REGIONS:
        if rx.search(location or ""):
            return name
    if work_mode == "Remoto":
        return "Remoto Colombia"
    if not (location or "").strip():
        return "Sin ciudad especificada"
    return "Otras regiones"


def work_mode(is_remote, location: str, title: str, description: str, remote_search: bool) -> str:
    """`remote_search`: la oferta salió de una búsqueda con filtro remoto de
    LinkedIn, así que es remota aunque el texto no lo diga."""
    blob = f"{location or ''} {title or ''}"
    if _HYBRID_RE.search(blob) or _HYBRID_RE.search(description or ""):
        return "Híbrido"
    if (is_remote and int(is_remote) == 1) or remote_search or _REMOTE_RE.search(blob):
        return "Remoto"
    return "Presencial"


def salary_usd(row: pd.Series, fx: dict[str, float]) -> tuple[float | None, float | None, float | None]:
    mn, mx = row.get("min_amount"), row.get("max_amount")
    if pd.isna(mn) and pd.isna(mx):
        return None, None, None
    factor = _INTERVAL_TO_YEARLY.get(str(row.get("interval") or "").lower(), 1)
    rate = fx.get(str(row.get("currency") or "USD").upper(), None)
    if rate is None:
        return None, None, None

    def conv(v):
        return None if pd.isna(v) else float(v) * factor * rate

    lo, hi = conv(mn), conv(mx)
    vals = [v for v in (lo, hi) if v is not None]
    mid = sum(vals) / len(vals) if vals else None
    # Descarta valores absurdos (monedas mal etiquetadas, salarios por hora
    # marcados como anuales, etc.)
    if mid is not None and not (3_000 <= mid <= 700_000):
        return None, None, None
    return lo, hi, mid


def enrich_all(conn, config: dict) -> int:
    """Recalcula todas las columnas derivadas para toda la base."""
    df = pd.read_sql(
        "SELECT id, title, company, location, is_remote, description, "
        "search_location, interval, min_amount, max_amount, currency FROM jobs",
        conn,
    )
    if df.empty:
        return 0

    fx = config["fx_to_usd"]
    remote_locations = {
        loc["name"] for loc in config.get("locations", []) if loc.get("is_remote")
    }
    updates = []
    for _, row in df.iterrows():
        title = row["title"] or ""
        desc = row["description"] or ""
        text = f"{title}\n{desc}"

        skills = extract_skills(text)
        role = canonical_role(title)
        years = extract_years(text)
        sen = seniority(title, desc, years)
        mode = work_mode(
            row["is_remote"], row["location"], title, desc,
            row["search_location"] in remote_locations,
        )
        country = infer_country(row["location"], row["search_location"])
        city = extract_city(row["location"])
        region = colombia_region(row["location"], country, mode)
        lo, hi, mid = salary_usd(row, fx)

        updates.append(
            (role, sen, years, json.dumps(skills, ensure_ascii=False),
             country, city, region, mode, lo, hi, mid, row["id"])
        )

    from psycopg2.extras import execute_batch

    execute_batch(
        conn,
        """UPDATE jobs SET role_canonical=%s, seniority=%s, years_experience=%s,
           skills=%s, country=%s, city=%s, region_colombia=%s, work_mode=%s,
           salary_min_usd=%s, salary_max_usd=%s, salary_mid_usd=%s WHERE id=%s""",
        updates,
        page_size=500,
    )
    conn.commit()
    return len(updates)
