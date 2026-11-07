"""EBSi 기출문제 수학 문제지·정답 내려받기 (선생님 컴퓨터에서 직접 실행하는 도구).

EBSi 는 클라우드 작업 공간에서 막혀 있어서, 이 스크립트는 선생님 컴퓨터에서 돌려야 한다.
파이썬만 있으면 되고 따로 설치할 것은 없다 (표준 라이브러리만 사용).

  python3 tools/download_ebsi.py                      # 2016~2026, 고1~고3, 수학 문제지(PDF)+정답(PNG)
  python3 tools/download_ebsi.py --dry-run            # 목록만 보고 내려받지는 않음
  python3 tools/download_ebsi.py --from 2020 --to 2022 --grades 고3
  python3 tools/download_ebsi.py --explanations       # 해설 PDF 도 함께

받은 파일은 inbox/ebsi/<학년>/<연도>/ 아래에 쌓이고, 이미 받은 파일은 건너뛰므로 중간에 멈춰도 다시 실행하면 이어서 받는다.
EBSi 서버에 부담을 주지 않도록 파일마다 잠깐 쉰다.
주의: 시험지 저작권은 평가원·각 시도교육청에 있다. 공개 저장소에 올릴지는 선생님이 판단한다.
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://www.ebsi.co.kr"
FILE_BASE = "https://wdown.ebsi.co.kr/W61001/01exam"
GRADES = {"고1": "D100", "고2": "D200", "고3": "D300"}
UA = {"User-Agent": "Mozilla/5.0 (gichul-atlas personal download tool)"}


def http(url, data=None, headers=None, cookie=None, tries=3):
    h = {**UA, **(headers or {})}
    if cookie:
        h["Cookie"] = cookie
    for k in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except Exception as e:  # 네트워크 일시 오류는 몇 번 다시 시도
            if k == tries - 1:
                raise
            time.sleep(2 * (k + 1))


def form_values(page: str, name: str) -> list[str]:
    """목록 페이지에서 <input name=...> 의 value 들을 모두 읽는다."""
    out = []
    for tag in re.findall(r"<input[^>]*>", page):
        if re.search(rf'name="{name}"', tag):
            m = re.search(r'value="([^"]*)"', tag)
            if m:
                out.append(m.group(1))
    return out


def parse_items(fragment: str) -> list[dict]:
    """목록 조각 → [{title, date, pdf, ans, hae}]"""
    items = []
    for block in fragment.split('<div class="qus_box')[1:]:
        title = re.search(r'<div class="qus_tit">(.*?)</div>', block, re.S)
        if not title:
            continue
        title = html.unescape(re.sub(r"<[^>]+>|\s+", " ", title.group(1))).replace("\xa0", " ").strip()
        title = re.sub(r"\s+", " ", title)
        p = re.search(r"goDownLoadP\('([^']*)'", block)
        j = re.search(r"goDownLoadJ\('([^']*)'", block)
        h = re.search(r"goDownLoadH\('([^']*)'", block)
        year = re.search(r'flag_subject_col_basic">(\d{4})<', block)
        if not (p or j):
            continue
        path = p.group(1) if p else ""
        date = re.search(r"/(\d{8})/", path or (j.group(1) if j else ""))
        items.append({
            "title": title,
            "year": year.group(1) if year else (date.group(1)[:4] if date else "unknown"),
            "date": date.group(1) if date else "",
            "pdf": FILE_BASE + path if path else "",
            "ans": j.group(1) if j else "",
            "hae": FILE_BASE + h.group(1) if h else "",
        })
    return items


def list_grade(grade: str, y0: int, y1: int, cookie: str | None) -> list[dict]:
    cd = GRADES[grade]
    page = http(f"{BASE}/ebs/xip/xipc/previousPaperList.ebs?targetCd={cd}", cookie=cookie).decode("utf-8", "replace")
    months = form_values(page, "month")
    math_ids = form_values(page, "sFormPartMath")
    ar = (form_values(page, "mathArOrd") or ["2"])[0]
    years = list(range(y0, y1 + 1))
    q = [("targetCd", cd), ("yearList", ",".join(map(str, years))), ("monthList", ",".join(months)),
         ("arOrd", ar), ("subjIdList", ",".join(math_ids)), ("sort", "recent"),
         ("paperId", ""), ("paperNo", ""), ("lvl", "")]
    q += [("year", str(y)) for y in years] + [("monthAll", "all"), ("mathArOrd", ar)]
    q += [("sFormPartMath", v) for v in math_ids]
    seen, items, total = set(), [], None
    for n in range(1, 40):
        body = urllib.parse.urlencode(q + [("currentPage", str(n))]).encode()
        frag = http(f"{BASE}/ebs/xip/xipc/previousPaperListAjax.ajax", data=body, cookie=cookie, headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest"}).decode("utf-8", "replace")
        if total is None:
            m = re.search(r'<em class="tot">(\d+)', frag)
            total = int(m.group(1)) if m else 0
        fresh = [it for it in parse_items(frag) if (it["pdf"] or it["ans"]) not in seen]
        if not fresh:
            break
        for it in fresh:
            seen.add(it["pdf"] or it["ans"])
            it["grade"] = grade
            items.append(it)
        if len(items) >= total:
            break
        time.sleep(0.5)
    print(f"  {grade}: 목록 {len(items)}개 (EBSi 표시 {total}개)")
    return items


def safe(s: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "", s).strip()


def save(url: str, dest: Path, cookie: str | None) -> str:
    if dest.exists() and dest.stat().st_size > 0:
        return "있음"
    data = http(url, cookie=cookie)
    if len(data) < 1000 or data[:5] == b"<!DOC" or data[:5].lower() == b"<html":
        return "실패(파일이 아님 — 로그인이 필요할 수 있어요: --cookie 사용)"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    time.sleep(0.8)
    return "받음"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from", dest="y0", type=int, default=2016)
    ap.add_argument("--to", dest="y1", type=int, default=2026)
    ap.add_argument("--grades", nargs="+", default=list(GRADES), choices=list(GRADES))
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "inbox" / "ebsi"))
    ap.add_argument("--explanations", action="store_true", help="해설 PDF 도 함께 받기")
    ap.add_argument("--dry-run", action="store_true", help="목록만 확인")
    ap.add_argument("--cookie", help='로그인이 필요할 때 브라우저의 쿠키 문자열 ("a=b; c=d")')
    a = ap.parse_args()

    out = Path(a.out)
    print(f"EBSi 수학 기출 {a.y0}~{a.y1}, {', '.join(a.grades)} → {out}")
    items = []
    for g in a.grades:
        items += list_grade(g, a.y0, a.y1, a.cookie)
    print(f"모두 {len(items)}개 시험")
    if a.dry_run:
        for it in items:
            print(" ·", it["year"], it["grade"], it["title"])
        return 0

    fails = 0
    for i, it in enumerate(items, 1):
        stem = f"{it['date'] or it['year']}_{safe(it['title'])}"
        folder = out / it["grade"] / it["year"]
        jobs = [("문제", it["pdf"], f"{stem}_문제.pdf"), ("정답", it["ans"], f"{stem}_정답.png")]
        if a.explanations:
            jobs.append(("해설", it["hae"], f"{stem}_해설.pdf"))
        res = []
        for label, url, name in jobs:
            if not url:
                res.append(f"{label}:없음")
                continue
            try:
                r = save(url, folder / name, a.cookie)
            except Exception as e:
                r = f"실패({e})"
            fails += r.startswith("실패")
            res.append(f"{label}:{r}")
        print(f"[{i}/{len(items)}] {it['title']} — " + " · ".join(res))

    manifest = out / "목록.json"
    out.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"끝. 실패 {fails}건. 목록은 {manifest} 에 저장했어요.")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
