# CV Optimizado en PDF estilo Harvard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El resultado del tailoring incluye un CV estructurado que se descarga como PDF de una página en estilo Harvard desde el modal de vacante.

**Architecture:** Gemini devuelve `cv_struct` (JSON con secciones); `backend/cv_pdf.py` lo valida, deriva el texto plano para la UI y lo renderiza con fpdf2 usando Liberation Serif vendorizada; `POST /api/cv-pdf` sirve el binario; el frontend añade el botón de descarga.

**Tech Stack:** FastAPI, fpdf2, Liberation Serif (TTF vendorizadas), Gemini (google-genai), vanilla JS.

**Spec:** `docs/superpowers/specs/2026-07-18-cv-pdf-harvard-design.md`

## Global Constraints

- Solo contenido verosímil: nunca inventar empleos/proyectos/skills sin base en el CV original; skills faltantes NO van al CV.
- Idioma del CV generado = idioma de la descripción de la vacante.
- Una página tamaño carta; si no cabe, reducir cuerpo 11→9pt por pasos y luego recortar bullets.
- Compatibilidad hacia atrás: si `cv_struct` no llega o es inválido, la UI actual sigue funcionando y el botón no aparece.
- Tests en `tests/`; correr con `uv run --with pytest --with httpx pytest tests/ -v`.
- Mensajes de error de la API en español.

---

### Task 1: Fuentes + `backend/cv_pdf.py` (validación, texto plano, render PDF)

**Files:**
- Create: `backend/fonts/LiberationSerif-{Regular,Bold,Italic}.ttf` (copiar de `/usr/share/fonts/truetype/liberation/`)
- Create: `backend/cv_pdf.py`
- Create: `tests/test_cv_pdf.py`
- Modify: `pyproject.toml` (añadir `"fpdf2>=2.8"` a dependencies)

**Interfaces:**
- Produces: `validate_cv_struct(obj) -> dict | None`; `struct_to_text(struct: dict) -> str`; `build_harvard_pdf(struct: dict) -> bytes`.
- `cv_struct` shape: `{"name": str, "contact": str, "sections": [{"title": str, "type": "paragraph"|"entries", "content": str?, "entries": [{"heading": str, "meta": str, "bullets": [str]}]?}]}`

- [ ] **Step 1: copiar fuentes y declarar dependencia**

```bash
mkdir -p backend/fonts tests
cp /usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf \
   /usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf \
   /usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf backend/fonts/
```
En `pyproject.toml`, añadir `"fpdf2>=2.8",` a `dependencies`. Correr `uv sync`.

- [ ] **Step 2: test que falla**

`tests/test_cv_pdf.py`:

```python
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.cv_pdf import build_harvard_pdf, struct_to_text, validate_cv_struct

STRUCT = {
    "name": "Alejandro Patrón",
    "contact": "alejandro@mail.com | +57 300 000 0000 | Medellín | linkedin.com/in/alejandro",
    "sections": [
        {"title": "Perfil", "type": "paragraph",
         "content": "Ingeniero de datos con 2 años de experiencia en pipelines ETL con Python, SQL y Spark."},
        {"title": "Experiencia", "type": "entries", "entries": [
            {"heading": "Ingeniero de Datos — Empresa X", "meta": "Medellín · 2022–Presente",
             "bullets": ["Construyó pipelines ETL con Airflow y Spark.",
                         "Data lake en S3 con Parquet — batch diario."]}]},
        {"title": "Educación", "type": "entries", "entries": [
            {"heading": "Ingeniería de Sistemas — Universidad Y", "meta": "2018–2022", "bullets": []}]},
        {"title": "Competencias", "type": "paragraph",
         "content": "Lenguajes: Python, SQL. Big Data: Spark, Airflow. Cloud: AWS."},
    ],
}


def test_validate_ok():
    assert validate_cv_struct(STRUCT) is not None


def test_validate_rechaza_invalido():
    assert validate_cv_struct(None) is None
    assert validate_cv_struct({"name": "", "sections": []}) is None
    assert validate_cv_struct({"name": "X"}) is None
    assert validate_cv_struct({"name": "X", "sections": [{"type": "paragraph"}]}) is None


def test_struct_to_text():
    text = struct_to_text(STRUCT)
    assert "ALEJANDRO PATRÓN" in text.upper()
    assert "Airflow" in text and "EXPERIENCIA" in text.upper()


def test_pdf_una_pagina_con_texto():
    from pypdf import PdfReader
    pdf = build_harvard_pdf(STRUCT)
    assert pdf.startswith(b"%PDF")
    reader = PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) == 1
    extracted = "\n".join(p.extract_text() for p in reader.pages)
    assert "Spark" in extracted and "Medell" in extracted


def test_pdf_contenido_largo_sigue_en_una_pagina():
    import copy
    big = copy.deepcopy(STRUCT)
    big["sections"][1]["entries"] = [
        {"heading": f"Ingeniero de Datos — Empresa {i}", "meta": f"Ciudad · 20{10+i}–20{11+i}",
         "bullets": [f"Logro número {j} con Python, SQL, Spark y Airflow en producción." for j in range(6)]}
        for i in range(5)
    ]
    from pypdf import PdfReader
    pdf = build_harvard_pdf(big)
    assert len(PdfReader(io.BytesIO(pdf)).pages) == 1
```

- [ ] **Step 3: correr y ver fallo** — `uv run --with pytest pytest tests/test_cv_pdf.py -v` → FAIL `ModuleNotFoundError: backend.cv_pdf`.

- [ ] **Step 4: implementar `backend/cv_pdf.py`**

```python
"""Validación del CV estructurado y render a PDF estilo Harvard (fpdf2)."""
from __future__ import annotations

from pathlib import Path

FONTS_DIR = Path(__file__).resolve().parent / "fonts"

_PAGE_W, _PAGE_H = 612, 792  # Letter, en puntos
_MARGIN = 54
_BODY_SIZES = [11, 10.5, 10, 9.5, 9]


def validate_cv_struct(obj) -> dict | None:
    """Devuelve el struct si tiene la forma mínima esperada; si no, None."""
    if not isinstance(obj, dict):
        return None
    name = obj.get("name")
    sections = obj.get("sections")
    if not isinstance(name, str) or not name.strip():
        return None
    if not isinstance(sections, list) or not sections:
        return None
    for sec in sections:
        if not isinstance(sec, dict) or not str(sec.get("title", "")).strip():
            return None
        has_content = isinstance(sec.get("content"), str) and sec["content"].strip()
        entries = sec.get("entries")
        has_entries = isinstance(entries, list) and any(
            isinstance(e, dict) and str(e.get("heading", "")).strip() for e in entries
        )
        if not has_content and not has_entries:
            return None
    return obj


def struct_to_text(struct: dict) -> str:
    """Texto plano del CV (misma fuente de verdad que el PDF) para la UI."""
    lines = [struct["name"].upper()]
    if struct.get("contact"):
        lines.append(struct["contact"])
    for sec in struct["sections"]:
        lines.append("")
        lines.append(str(sec["title"]).upper())
        if sec.get("content"):
            lines.append(sec["content"])
        for e in sec.get("entries") or []:
            heading = e.get("heading", "")
            meta = e.get("meta", "")
            lines.append(f"{heading} | {meta}" if meta else heading)
            for b in e.get("bullets") or []:
                lines.append(f"- {b}")
    return "\n".join(lines)


def build_harvard_pdf(struct: dict) -> bytes:
    """PDF carta de una página, estilo Harvard. Reduce fuente y recorta
    bullets si el contenido no cabe."""
    import copy

    struct = copy.deepcopy(struct)
    while True:
        for size in _BODY_SIZES:
            pdf, fits = _render(struct, size)
            if fits:
                return bytes(pdf.output())
        if not _drop_one_bullet(struct):
            return bytes(pdf.output())  # sin más que recortar: entregar tal cual


def _drop_one_bullet(struct: dict) -> bool:
    """Quita el último bullet de la entrada con más bullets. True si quitó algo."""
    best = None
    for sec in struct["sections"]:
        for e in sec.get("entries") or []:
            bullets = e.get("bullets") or []
            if bullets and (best is None or len(bullets) > len(best)):
                best = bullets
    if best:
        best.pop()
        return True
    return False


def _render(struct: dict, body: float):
    from fpdf import FPDF

    pdf = FPDF(unit="pt", format="Letter")
    pdf.set_margins(_MARGIN, _MARGIN, _MARGIN)
    pdf.set_auto_page_break(False)
    pdf.add_font("Serif", "", str(FONTS_DIR / "LiberationSerif-Regular.ttf"))
    pdf.add_font("Serif", "B", str(FONTS_DIR / "LiberationSerif-Bold.ttf"))
    pdf.add_font("Serif", "I", str(FONTS_DIR / "LiberationSerif-Italic.ttf"))
    pdf.add_page()
    epw = pdf.epw
    lh = body * 1.32

    pdf.set_font("Serif", "B", body + 5)
    pdf.cell(epw, (body + 5) * 1.3, struct["name"].upper(), align="C",
             new_x="LMARGIN", new_y="NEXT")
    if struct.get("contact"):
        pdf.set_font("Serif", "", body - 1)
        pdf.multi_cell(epw, lh, struct["contact"], align="C")
    pdf.ln(body * 0.6)

    for sec in struct["sections"]:
        pdf.set_font("Serif", "B", body)
        pdf.cell(epw, lh, str(sec["title"]).upper(), new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y()
        pdf.line(_MARGIN, y, _MARGIN + epw, y)
        pdf.ln(body * 0.35)

        if sec.get("content"):
            pdf.set_font("Serif", "", body)
            pdf.multi_cell(epw, lh, sec["content"])
            pdf.ln(body * 0.3)

        for e in sec.get("entries") or []:
            heading, meta = e.get("heading", ""), e.get("meta", "")
            pdf.set_font("Serif", "B", body)
            meta_w = 0
            if meta:
                pdf.set_font("Serif", "I", body - 0.5)
                meta_w = pdf.get_string_width(meta) + 6
            pdf.set_font("Serif", "B", body)
            pdf.cell(epw - meta_w, lh, heading)
            if meta:
                pdf.set_font("Serif", "I", body - 0.5)
                pdf.cell(meta_w, lh, meta, align="R")
            pdf.ln(lh)
            pdf.set_font("Serif", "", body)
            for b in e.get("bullets") or []:
                pdf.set_x(_MARGIN + 12)
                pdf.multi_cell(epw - 12, lh, f"• {b}")
            pdf.ln(body * 0.3)
        pdf.ln(body * 0.2)

    fits = pdf.page_no() == 1 and pdf.get_y() <= _PAGE_H - _MARGIN
    return pdf, fits
```

Nota: con `set_auto_page_break(False)` fpdf2 no crea páginas nuevas, así que
el overflow se detecta con `get_y()` pasando el margen inferior.

- [ ] **Step 5: correr tests** — `uv run --with pytest pytest tests/test_cv_pdf.py -v` → 5 PASS. Inspección visual: generar un PDF de muestra en el scratchpad y abrirlo con Read (imagen) vía `pdftoppm` o similar si hace falta ajustar espaciados.

- [ ] **Step 6: commit** — `git add backend/fonts backend/cv_pdf.py tests/test_cv_pdf.py pyproject.toml uv.lock && git commit -m "feat: render de CV estructurado a PDF estilo Harvard"`

---

### Task 2: `cv_struct` desde Gemini + endpoint `/api/cv-pdf`

**Files:**
- Modify: `backend/cv_tailor.py` (SYSTEM_PROMPT y post-proceso)
- Modify: `backend/models.py` (campo `cv_struct`)
- Modify: `backend/main.py` (tailor usa struct; nuevo endpoint)
- Create: `tests/test_api_cv_pdf.py`

**Interfaces:**
- Consumes: `validate_cv_struct`, `struct_to_text`, `build_harvard_pdf` de `backend.cv_pdf`.
- Produces: `TailorResponse.cv_struct: dict | None`; `POST /api/cv-pdf` body `{"cv_struct": {...}, "company": "..."}` → `application/pdf`.

- [ ] **Step 1: test que falla**

`tests/test_api_cv_pdf.py`:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

import backend.main as main
from tests.test_cv_pdf import STRUCT

client = TestClient(main.app)


def test_cv_pdf_ok():
    r = client.post("/api/cv-pdf", json={"cv_struct": STRUCT, "company": "NTT DATA"})
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert "CV_Optimizado_NTT_DATA.pdf" in r.headers["content-disposition"]
    assert r.content.startswith(b"%PDF")


def test_cv_pdf_invalido_400():
    r = client.post("/api/cv-pdf", json={"cv_struct": {"name": ""}, "company": "X"})
    assert r.status_code == 400
    assert "inválida" in r.json()["detail"]
```

(`tests/__init__.py` vacío para poder importar `tests.test_cv_pdf`.)

- [ ] **Step 2: correr y ver fallo** — `uv run --with pytest --with httpx pytest tests/test_api_cv_pdf.py -v` → FAIL 404.

- [ ] **Step 3: implementar**

`backend/models.py` — en `TailorResponse` añadir:

```python
    cv_struct: dict | None = None
```

`backend/cv_tailor.py` — en SYSTEM_PROMPT, sustituir la línea del campo
`"tailored_cv"` del JSON de ejemplo por:

```
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
```

y sustituir la regla de `tailored_cv` por estas reglas:

```
- cv_struct: el CV completo optimizado, estructurado para maquetar en UNA página:
  - ESCRÍBELO EN EL IDIOMA DE LA DESCRIPCIÓN DE LA VACANTE (vacante en inglés → CV en inglés).
  - Usa SOLO información real del CV original: reformula y reordena con los términos
    de la vacante, integra keywords defendibles en Competencias, pero NUNCA inventes
    empleos, proyectos, títulos ni skills que el candidato no tenga. Las skills que
    le faltan van solo en missing_skills/recommendations, no en el CV.
  - Conserva los datos de contacto del CV original en "contact".
  - Sé conciso: máximo 4 bullets por empleo, para que quepa en una página.
  - Los títulos de sección también en el idioma de la vacante.
```

En `tailor_cv()`, subir `max_output_tokens` a `8192` y, antes del `return`,
derivar el texto plano (import arriba: `from backend.cv_pdf import
struct_to_text, validate_cv_struct`):

```python
            parsed = json.loads(raw)  # (o el recorte {…} ya existente)
            struct = validate_cv_struct(parsed.get("cv_struct"))
            if struct:
                parsed["cv_struct"] = struct
                parsed["tailored_cv"] = struct_to_text(struct)
            else:
                parsed["cv_struct"] = None
                parsed.setdefault("tailored_cv", "")
            return parsed
```

`backend/main.py` — añadir a los imports `Response` de fastapi y
`from backend.cv_pdf import build_harvard_pdf, validate_cv_struct`; en
`api_tailor_cv` añadir al `TailorResponse(...)` el campo
`cv_struct=result.get("cv_struct")`; y añadir el endpoint:

```python
import re


@app.post("/api/cv-pdf")
def api_cv_pdf(
    cv_struct: dict = Body(..., embed=True),
    company: str = Body("", embed=True),
) -> Response:
    struct = validate_cv_struct(cv_struct)
    if not struct:
        raise HTTPException(400, "Estructura de CV inválida o incompleta.")
    try:
        pdf_bytes = build_harvard_pdf(struct)
    except Exception as e:
        raise HTTPException(500, f"No se pudo generar el PDF: {e}")
    slug = re.sub(r"[^A-Za-z0-9]+", "_", company).strip("_")[:40] or "vacante"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="CV_Optimizado_{slug}.pdf"'},
    )
```

- [ ] **Step 4: correr todos los tests** — `uv run --with pytest --with httpx pytest tests/ -v` → todos PASS.

- [ ] **Step 5: commit** — `git add backend tests && git commit -m "feat: cv_struct del LLM y endpoint /api/cv-pdf"`

---

### Task 3: botón de descarga en el frontend

**Files:**
- Modify: `dashboard/job-detail.js`

**Interfaces:**
- Consumes: `POST /api/cv-pdf` (Task 2); `data.cv_struct` de `/api/tailor-cv`.

- [ ] **Step 1: implementar**

En `renderJobInfo(job)`, primera línea: `_currentJob = job;` y declarar
`let _currentJob = null;` junto a `_currentJobId` (línea 8).

En `renderTailorResult(data)`, tras el bloque de `tailored_cv`, añadir al
template (solo si `data.cv_struct`):

```js
    ${data.cv_struct ? `
      <button id="btn-download-cv" style="width:100%;margin-top:12px;padding:13px;border-radius:12px;border:1px solid var(--line, rgba(255,255,255,0.09));background:rgba(113,150,59,0.12);color:var(--sage, #71963b);font:inherit;font-size:14px;font-weight:600;cursor:pointer;">
        ⬇ Descargar CV Optimizado (PDF)
      </button>
      <div id="cv-download-error"></div>
    ` : ""}
```

y al final de la función, junto al bloque de `requestAnimationFrame`:

```js
  const dlBtn = result.querySelector("#btn-download-cv");
  if (dlBtn) dlBtn.addEventListener("click", () => downloadTailoredPdf(data.cv_struct, dlBtn));
```

Nueva función:

```js
async function downloadTailoredPdf(cvStruct, btn) {
  const errBox = document.getElementById("cv-download-error");
  errBox.innerHTML = "";
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Generando PDF...";
  const company = (_currentJob && _currentJob.company) || "vacante";
  try {
    const res = await fetch(`${API_BASE}/api/cv-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cv_struct: cvStruct, company }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CV_Optimizado_${company.replace(/[^\w]+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    errBox.innerHTML = `<div style="padding:10px;color:var(--rust, #c05e2f);font-size:13px;"><strong>Error:</strong> ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}
```

- [ ] **Step 2: verificar sintaxis** — `node --check dashboard/job-detail.js` → sin errores.

- [ ] **Step 3: commit** — `git add dashboard/job-detail.js && git commit -m "feat: botón de descarga del CV optimizado en PDF"`

---

### Task 4: verificación end-to-end y deploy

**Files:** ninguno nuevo (verificación).

- [ ] **Step 1: verificación local completa** — `uv run --with pytest --with httpx pytest tests/ -v` (todos PASS) y generar un PDF de muestra con `STRUCT`, convertirlo a imagen y revisarlo visualmente (formato Harvard, una página, acentos correctos).

- [ ] **Step 2: push** — `git push origin main` (Railway reconstruye ~2 min; Vercel publica el JS).

- [ ] **Step 3: verificar producción** —

```bash
# tailoring real → guardar cv_struct
curl -sS -X POST https://astrodata-jobs.vercel.app/api/tailor-cv \
  -F 'file=@cv_test.txt' -F 'job_id=li-4414172433' > tailor.json
python3 -c "import json;d=json.load(open('tailor.json'));assert d.get('cv_struct'),'sin cv_struct';json.dump({'cv_struct':d['cv_struct'],'company':'Scotiabank'},open('pdf_req.json','w'))"
curl -sS -X POST https://astrodata-jobs.vercel.app/api/cv-pdf \
  -H 'Content-Type: application/json' -d @pdf_req.json -o cv_prod.pdf
file cv_prod.pdf  # → PDF document, 1 page
```

Esperado: `cv_struct` presente, PDF válido de 1 página con el contenido del CV.
