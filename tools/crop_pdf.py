"""시험지 PDF 한 쪽에서 그림 부분만 고해상도로 잘라 PNG로 저장.

좌표는 쪽 너비·높이에 대한 0~1 비율 (쪽 그림 위에서 눈으로 잰 값을 그대로 쓰면 된다).
사용: python3 tools/crop_pdf.py 시험지.pdf 쪽번호 x0 y0 x1 y1 출력.png [--dpi 300]
"""

import argparse
from pathlib import Path

import pymupdf as fitz


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("page", type=int, help="1부터 시작")
    ap.add_argument("x0", type=float)
    ap.add_argument("y0", type=float)
    ap.add_argument("x1", type=float)
    ap.add_argument("y1", type=float)
    ap.add_argument("out")
    ap.add_argument("--dpi", type=int, default=300)
    a = ap.parse_args()

    if not (0 <= a.x0 < a.x1 <= 1 and 0 <= a.y0 < a.y1 <= 1):
        raise SystemExit("좌표는 0 ≤ x0 < x1 ≤ 1, 0 ≤ y0 < y1 ≤ 1 이어야 합니다")
    page = fitz.open(a.pdf)[a.page - 1]
    r = page.rect
    clip = fitz.Rect(r.x0 + a.x0 * r.width, r.y0 + a.y0 * r.height, r.x0 + a.x1 * r.width, r.y0 + a.y1 * r.height)
    pix = page.get_pixmap(dpi=a.dpi, clip=clip)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    pix.save(a.out)
    print(f"{a.out} {pix.width}×{pix.height}px · 인쇄 폭 약 {clip.width / 72 * 25.4:.0f}mm")


if __name__ == "__main__":
    main()
