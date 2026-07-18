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
