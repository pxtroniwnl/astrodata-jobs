# CV Optimizado descargable en PDF estilo Harvard

Fecha: 2026-07-18 · Estado: aprobado por el usuario

## Problema

El tailoring de CV (`POST /api/tailor-cv`) devuelve el CV optimizado como texto
plano que solo se puede leer en pantalla. El usuario quiere descargar un PDF
con formato Harvard clásico, listo para enviar, que integre los insights del
análisis (keywords de la vacante, reformulación de experiencia).

## Requisitos (decididos con el usuario)

- **Honestidad**: solo contenido verosímil. Se reformula la experiencia real
  con los términos de la vacante y se añaden keywords defendibles a
  Competencias. Nunca se inventan empleos, proyectos ni skills sin base en el
  CV original. Las skills que realmente faltan siguen en "Recomendaciones",
  fuera del CV.
- **Idioma**: el de la descripción de la vacante (inglés → CV en inglés).
- **Longitud**: una sola página tamaño carta.
- **Estilo Harvard**: nombre centrado en mayúsculas, línea de contacto,
  títulos de sección en mayúsculas con filete horizontal, cargo en negrita a
  la izquierda con fechas a la derecha, bullets. Tipografía serif.

## Diseño (enfoque aprobado: PDF en el backend con fpdf2)

### 1. `backend/cv_tailor.py` — salida estructurada

El prompt de Gemini pide un campo adicional `cv_struct`:

```json
{
  "name": "ALEJANDRO PATRON",
  "contact": "email | teléfono | ciudad | linkedin",
  "sections": [
    {"title": "PERFIL", "type": "paragraph", "content": "..."},
    {"title": "EXPERIENCIA", "type": "entries", "entries": [
      {"heading": "Cargo — Empresa", "meta": "Ciudad · 2022–Presente",
       "bullets": ["logro con keyword de la vacante", "..."]}
    ]},
    {"title": "EDUCACIÓN", "type": "entries", "entries": [...]},
    {"title": "COMPETENCIAS", "type": "paragraph", "content": "Grupo: a, b, c"}
  ]
}
```

El texto plano `tailored_cv` que ya muestra la UI se deriva de `cv_struct` en
el servidor (una sola fuente de verdad). Si el LLM no devuelve una estructura
válida, se conserva el comportamiento actual (`tailored_cv` del LLM,
`cv_struct = null`) y el botón de descarga no aparece.

### 2. `backend/cv_pdf.py` (nuevo) — `build_harvard_pdf(struct) -> bytes`

- fpdf2, tamaño carta, márgenes ~1.9 cm.
- Liberation Serif (regular/bold/italic) incluida en `backend/fonts/`
  (licencia SIL OFL) para que local y Railway rendericen idéntico y con
  Unicode completo.
- Ajuste a una página: intenta cuerpo 11pt y reduce por pasos hasta 9pt;
  si aún no cabe, recorta bullets finales de Experiencia.

### 3. `backend/main.py` — `POST /api/cv-pdf`

- Body JSON: `{"cv_struct": {...}, "company": "..."}`.
- Valida que existan `name` y `sections` no vacías (400 si no).
- Responde `application/pdf` con
  `Content-Disposition: attachment; filename="CV_Optimizado_<Empresa>.pdf"`.
- No llama al LLM ni a la base de datos: render puro, rápido y determinista.

### 4. `dashboard/job-detail.js` — botón de descarga

- `renderTailorResult` guarda `data.cv_struct`; si existe, muestra
  "⬇ Descargar CV Optimizado (PDF)" bajo el CV optimizado.
- Click → `fetch POST /api/cv-pdf` → blob → `<a download>`. Errores con el
  mismo patrón ya existente (detalle real del servidor / fallo de red).

### 5. Modelos y dependencias

- `TailorResponse.cv_struct: dict | None` en `backend/models.py`.
- `fpdf2` en `pyproject.toml`. Fuentes vendorizadas (~1 MB, se commitean).

## Errores

- `cv_struct` ausente o inválido → botón oculto; la UI actual sigue igual.
- `/api/cv-pdf` con struct malformado → 400 con detalle en español.
- Fallo de render inesperado → 500 con detalle (patrón actual).

## Verificación

- Tests locales: `build_harvard_pdf` produce 1 página con texto extraíble
  (pypdf); endpoint `/api/cv-pdf` vía TestClient (200 con struct válido,
  400 con inválido); `node --check` del JS.
- Producción tras deploy: `POST /api/tailor-cv` real → `cv_struct` presente →
  `POST /api/cv-pdf` devuelve `%PDF` de 1 página vía dominio de Vercel.
