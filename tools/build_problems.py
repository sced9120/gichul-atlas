"""문항 원본(JSON, 수식은 $LaTeX$) → 배포용 문항 데이터 (GitHub Actions에서 실행).

관리자가 문항을 승인해 저장소에 커밋하면 이 스크립트가 돈다.
- LaTeX → 한글 수식 스크립트 + 수식 상자 크기 (지원하지 않는 명령은 오류로 멈춤 → 승인 단계에서 바로 발견)
- 출처 필드 → "2022년 고1 9월 전국연합학력평가 21번" 같은 출처 문구
- <u>…</u> → 밑줄 글자, 그림 이미지 크기
사용자 브라우저는 계산 없이 이어 붙이기만 하므로 AI 토큰·서버가 들지 않는다.

사용: python3 build_problems.py problems.src.json problems.json
"""

import json
import shutil
import re
import sys
from pathlib import Path

from hwpx.equation.authoring import latex_to_eqedit
from hwpx.equation.measure import measure_equation
from PIL import Image

MATH = re.compile(r"\$([^$]+)\$")
UNDERLINE = re.compile(r"<u>(.*?)</u>")
BASE_UNIT = 1000           # 10pt, 원본 양식과 같은 크기
GRID_CELL_CONTENT = 6000   # 선택지 3칸 표 한 칸의 글자 폭 (셀 8410 - 여백 - "① ")


def format_source(s: dict) -> str:
    """출처 필드 → 출처 문구. 문구를 바꾸려면 이 함수만 고치면 된다."""
    subj = f" {s['subject']}" if s.get("subject") else ""
    if s["org"] == "edu":     # 시·도교육청 전국연합학력평가: 시행연도
        return f"{s['year']}년 {s['grade']} {s['month']}월 전국연합학력평가{subj} {s['no']}번"
    if s["org"] == "kice":    # 한국교육과정평가원: 학년도
        exam = "대학수학능력시험" if s["month"] == 11 else f"{s['month']}월 모의평가"
        return f"{s['year']}학년도 {exam}{subj} {s['no']}번"
    raise ValueError(f"src.org 는 edu(교육청)·kice(평가원)만 받는다 — 학교 시험 문항은 넣지 않는다: {s.get('org')}")


def text_width(s: str) -> int:
    return sum(500 if ch == " " else 550 if ord(ch) < 0x1100 else 1000 for ch in s)


def to_runs(src: str) -> list[dict]:
    """'다음 중 <u>틀린</u> 점 $(3,4)$를' → 글자·밑줄·수식 조각 목록"""
    runs = []
    for k, part in enumerate(UNDERLINE.split(src)):
        under = k % 2 == 1
        pos = 0
        for m in MATH.finditer(part):
            if m.start() > pos:
                runs.append({"t": part[pos:m.start()], **({"u": True} if under else {})})
            script = latex_to_eqedit(m.group(1))
            size = measure_equation(script, base_unit=BASE_UNIT)
            runs.append({"eq": script, "w": size.width, "h": size.height, "bl": size.base_line})
            pos = m.end()
        if pos < len(part):
            runs.append({"t": part[pos:], **({"u": True} if under else {})})
    return runs


def runs_width(runs: list[dict]) -> int:
    return sum(r["w"] + 112 if "eq" in r else text_width(r["t"]) for r in runs)


def build(item: dict, base: Path) -> dict:
    out = {k: item.get(k) for k in ("id", "area", "subject", "unit", "standards", "points", "rate", "type", "answer", "concepts", "outOfCurriculum")}
    if item.get("alsoIn"):   # 두 과목에 걸치는 문항: [{"subject":…, "unit":…}] (선생님 결정 2026-11-08)
        out["alsoIn"] = item["alsoIn"]
    out["src"] = item["src"]
    out["source"] = format_source(item["src"])
    if item.get("stem"):
        out["stemRuns"] = to_runs(item["stem"])
    for key in ("figure", "image"):   # figure: 발문 아래 그림만 / image: 문항 전체를 그림으로
        if item.get(key):
            out[key] = item[key]
            with Image.open(base / item[key]) as im:
                out[key + "Size"] = list(im.size)
    if item.get("figureWidthMm"):
        out["figureWidthMm"] = item["figureWidthMm"]
    if item.get("choices"):
        choices = [to_runs(c) for c in item["choices"]]
        out["choiceRuns"] = choices
        out["choiceLayout"] = "grid3" if max(runs_width(c) for c in choices) <= GRID_CELL_CONTENT else "list"
    return out


def main(src: str, dst: str) -> None:
    items = json.loads(Path(src).read_text(encoding="utf-8"))
    built = [build(it, Path(src).parent) for it in items]
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    Path(dst).write_text(json.dumps(built, ensure_ascii=False, indent=1), encoding="utf-8")
    # 문항이 쓰는 그림을 사이트 폴더로 복사 (data/math/images → site/data/math/images)
    for b in built:
        for key in ("figure", "image"):
            if b.get(key):
                target = Path(dst).parent / b[key]
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(Path(src).parent / b[key], target)
    for b in built:
        print(b["id"], b.get("choiceLayout", "-"), b["source"])
    # 출처 문구 형식 예시
    print(format_source({"org": "edu", "year": 2022, "grade": "고1", "month": 9, "no": 21}))
    print(format_source({"org": "kice", "year": 2025, "month": 6, "subject": "미적분", "no": 30}))
    print(format_source({"org": "kice", "year": 2026, "month": 11, "no": 22}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
