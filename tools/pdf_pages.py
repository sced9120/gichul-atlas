"""시험지 PDF → 쪽마다 PNG (기출 분석 팀이 원본을 보고 옮길 때 쓴다).

사용: python3 tools/pdf_pages.py 시험지.pdf 출력폴더 [--dpi 200] [--first N]
출력: 출력폴더/p1.png, p2.png, … 와 쪽 크기 목록(pages.json)
"""

import argparse
import json
from pathlib import Path

import pymupdf as fitz


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--first", type=int, default=0, help="앞에서 N쪽만 (0이면 전부)")
    a = ap.parse_args()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(a.pdf)
    pages = []
    n = len(doc) if a.first <= 0 else min(a.first, len(doc))
    for i in range(n):
        page = doc[i]
        pix = page.get_pixmap(dpi=a.dpi)
        path = out / f"p{i + 1}.png"
        pix.save(path)
        pages.append({"page": i + 1, "png": path.name, "width_pt": page.rect.width, "height_pt": page.rect.height,
                      "has_text": bool(page.get_text("text").strip())})
    (out / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{n}쪽 → {out}")


if __name__ == "__main__":
    main()
