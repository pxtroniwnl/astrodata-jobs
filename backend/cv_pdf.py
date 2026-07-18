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
        content = sec.get("content")
        has_content = isinstance(content, str) and content.strip()
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
