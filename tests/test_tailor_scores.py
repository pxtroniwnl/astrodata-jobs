import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.cv_tailor import _finalize
from tests.test_cv_pdf import STRUCT


def _parsed(**overrides):
    base = {"match_score": 62, "optimized_score": 88, "cv_struct": copy.deepcopy(STRUCT)}
    base.update(overrides)
    return base


def test_optimized_score_se_conserva():
    out = _finalize(_parsed())
    assert out["optimized_score"] == 88
    assert out["match_score"] == 62


def test_scores_se_acotan_a_0_100():
    assert _finalize(_parsed(optimized_score=150))["optimized_score"] == 100
    assert _finalize(_parsed(optimized_score=-5))["optimized_score"] == 0
    assert _finalize(_parsed(match_score=130))["match_score"] == 100


def test_optimized_score_invalido_es_none():
    out = _finalize(_parsed(optimized_score="alto"))
    assert out["optimized_score"] is None
    base = _parsed()
    del base["optimized_score"]
    assert _finalize(base)["optimized_score"] is None


def test_cv_struct_invalido_anula_optimized_score():
    out = _finalize(_parsed(cv_struct={"name": ""}))
    assert out["cv_struct"] is None
    assert out["optimized_score"] is None
