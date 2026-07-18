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
