"""문항 묶음(JSON) 자동 점검 — 기출 분석 팀이 오르빗 검수 전에 돌린다.

확인: 필수 칸, 형식, 과목·단원이 curriculum.json 에 있는지, 그림 파일, LaTeX 변환(build_problems 와 같은 변환기),
      그림만 있고 발문이 없는 문항(글로 옮길 수 있는지 의심), 출처 문구 생성.
사용: python3 tools/check_problems.py 묶음.json [--images data/math/images] [--allow-empty-class]
종료 코드 0 = 통과, 1 = 오류 있음. 오류마다 '역할' 을 붙여 어느 팀원에게 돌려보낼지 알려 준다.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_problems import format_source, to_runs  # noqa: E402

TYPES = {"선택형", "단답형", "서술형"}
ORGS = {"edu", "kice"}  # 수능·모의평가·학력평가만 (학교 시험은 받지 않음)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("batch")
    ap.add_argument("--images", default=str(ROOT / "data/math/images"))
    ap.add_argument("--allow-empty-class", action="store_true", help="분류 전 단계 점검(과목 칸 비어도 통과)")
    a = ap.parse_args()

    items = json.loads(Path(a.batch).read_text(encoding="utf-8"))
    cur = json.loads((ROOT / "site/data/math/curriculum.json").read_text(encoding="utf-8"))
    units = {s["name"]: set(s["units"]) for s in cur["subjects"]}
    existing = {p["id"] for p in json.loads((ROOT / "data/math/problems.src.json").read_text(encoding="utf-8"))}
    errors, warns, seen = [], [], set()

    def err(pid, role, msg):
        errors.append(f"[{role}] {pid}: {msg}")

    for it in items:
        pid = it.get("id", "?")
        if not re.fullmatch(r"[a-z0-9-]+", pid):
            err(pid, "전사", "id 는 영문 소문자·숫자·- 만")
        if pid in seen:
            err(pid, "전사", "id 중복")
        seen.add(pid)
        if pid in existing:
            warns.append(f"{pid}: 이미 있는 id — 반영 시 바꿔 넣음")
        if it.get("area") != "math":
            err(pid, "전사", 'area 는 "math"')
        if it.get("type") not in TYPES:
            err(pid, "전사", f"type 은 {TYPES} 중 하나")
        if not isinstance(it.get("points"), (int, float)) or not 1 <= it["points"] <= 10:
            err(pid, "전사", "points 숫자(배점)")

        stem = it.get("stem") or ""
        if not stem and not it.get("image"):
            err(pid, "전사", "발문(stem)이 비어 있음")
        if it.get("image") and not stem:
            warns.append(f"{pid}: 문항 전체가 그림 — 글로 옮길 수 있는지 오르빗이 확인")
        for label, text in [("stem", stem)] + [(f"choices[{i}]", c) for i, c in enumerate(it.get("choices") or [])]:
            if text.count("$") % 2:
                err(pid, "전사", f"{label}: $ 짝이 맞지 않음")
                continue
            try:
                to_runs(text)
            except Exception as e:  # 지원되지 않는 LaTeX 명령 등
                err(pid, "전사", f"{label}: 수식 변환 실패 — {e}")
        if it.get("type") == "선택형" and len(it.get("choices") or []) != 5:
            err(pid, "전사", "선택형은 선택지 5개")
        if it.get("type") != "선택형" and it.get("choices"):
            err(pid, "전사", "선택형이 아닌데 선택지가 있음")
        if re.search(r"[①②③④⑤]", " ".join(it.get("choices") or [])):
            err(pid, "전사", "선택지에 번호 기호(①~⑤)를 넣지 않음")
        for key in ("figure", "image"):
            if it.get(key):
                f = Path(a.images).parent / it[key]
                if not f.exists():
                    err(pid, "전사", f"{key} 파일 없음: {f}")

        src = it.get("src")
        if not isinstance(src, dict) or src.get("org") not in ORGS:
            err(pid, "정답·출처", "src.org 는 edu/kice (학교 시험 문항은 받지 않음)")
        else:
            try:
                format_source(src)
            except Exception as e:
                err(pid, "정답·출처", f"src 칸 부족 — {e}")
        if it.get("type") == "선택형" and it.get("answer") is not None and it["answer"] not in (1, 2, 3, 4, 5):
            err(pid, "정답·출처", "선택형 answer 는 1~5")
        if it.get("answer") is None:
            warns.append(f"{pid}: 정답 없음")

        if not a.allow_empty_class:
            subj, unit = it.get("subject"), it.get("unit")
            if subj not in units:
                err(pid, "분류", f"subject '{subj}' 가 curriculum.json 에 없음")
            elif unit not in units[subj]:
                err(pid, "분류", f"unit '{unit}' 가 {subj} 단원에 없음")
            for extra in it.get("alsoIn") or []:
                es, eu = extra.get("subject"), extra.get("unit")
                if es not in units:
                    err(pid, "분류", f"alsoIn subject '{es}' 가 curriculum.json 에 없음")
                elif eu not in units[es]:
                    err(pid, "분류", f"alsoIn unit '{eu}' 가 {es} 단원에 없음")
                elif (es, eu) == (subj, unit):
                    err(pid, "분류", "alsoIn 이 주 분류와 같음")
            if not it.get("standards"):
                err(pid, "분류", "standards(성취기준 코드) 비어 있음")
            if not it.get("concepts"):
                err(pid, "분류", "concepts 비어 있음")

    for w in warns:
        print("주의 ·", w)
    for e in errors:
        print("오류 ·", e)
    print(f"점검: {len(items)}문항 · 오류 {len(errors)} · 주의 {len(warns)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
