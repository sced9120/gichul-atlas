"""시험지 양식 HWP → 플랫폼용 HWPX 템플릿 (관리자가 양식을 바꿀 때 한 번만 실행).

하는 일
1. .hwp(5.0)를 .hwpx로 변환한다 (python-hwpx, 한글 프로그램 불필요).
2. 머리 표는 윗줄(시험명·이름)만 남기고 문항수·배점 줄은 지운다.
3. 꼬리말은 머리 문단으로 옮기고, 기존 문항 문단은 모두 지운다.
4. 머리 표·안내 상자·꼬리말 글자를 {{TITLE}} 같은 자리표시자로 바꾼다.
5. 출처 줄(작은 회색, 오른쪽), 그림(가운데), 문항 블록용 모양을 header.xml에 추가한다.
6. 문항 블록 높이(한 단에 2문항)를 쪽 크기에서 계산해 template.json에 저장한다.

사용: python3 prepare_template.py 원본.hwp 출력.hwpx
"""

import copy
import json
import re
import sys
import zipfile
from pathlib import Path

from hwpx import HwpxDocument
from lxml import etree

HP = "{http://www.hancom.co.kr/hwpml/2011/paragraph}"
HH = "{http://www.hancom.co.kr/hwpml/2011/head}"
HC = "{http://www.hancom.co.kr/hwpml/2011/core}"

# 원본 양식의 글자 → 자리표시자 (양식마다 이 표만 맞추면 된다)
HEADER_MAP = [
    ("2026학년도 2학기 1차 시험", "{{TITLE}}"),
    ("고사일시", "{{SUBTITLE}}"),
    ("고등학교", ""),
    ("※ 문제지의 매수", "{{NOTE1}}"),
    ("※ 선택형 문항은", "{{NOTE2}}"),
    ("※ 단답형 문항과", "{{NOTE3}}"),
    ("이 시험문제는 학교의", "{{FOOTER1}}"),
    ("2026학년도 2학기 1차 시험 1학년", "{{FOOTER2}}"),
]

LINE_GAP = 600      # 10pt 글자, 줄 간격 160% → 줄마다 600 추가 (원본 줄 배치에서 확인)
SAFETY = 900        # 한 단을 넘치지 않도록 남기는 여유


def add_para_pr(paras_pr, base_id, align, intent="0"):
    base = paras_pr.find(HH + f"paraPr[@id='{base_id}']")
    new = copy.deepcopy(base)
    new.set("id", str(len(paras_pr)))
    new.find(HH + "align").set("horizontal", align)
    for el in new.iter(HC + "intent"):
        el.set("value", intent)
    paras_pr.append(new)
    paras_pr.set("itemCnt", str(len(paras_pr)))
    return new.get("id")


def main(src: str, out: str) -> None:
    tmp = Path(out).with_suffix(".raw.hwpx")
    HwpxDocument.open(src).save_to_path(str(tmp))
    zin = zipfile.ZipFile(tmp)
    files = {n: zin.read(n) for n in zin.namelist()}

    sec = etree.fromstring(files["Contents/section0.xml"])
    paras = list(sec)
    head_para = paras[0]
    footer_para = next(p for p in paras if p.find(".//" + HP + "footer") is not None)

    # 자리표시자 치환 (머리 문단·꼬리말)
    used = set()
    for p in (head_para, footer_para):
        for t in p.iter(HP + "t"):
            for i, (needle, repl) in enumerate(HEADER_MAP):
                if t.text and needle in t.text and i not in used:
                    t.text = repl
                    used.add(i)
                    break

    # 머리 표: 둘째 줄(문항수·배점) 삭제
    header_tbl = next(head_para.iter(HP + "tbl"))
    rows = header_tbl.findall(HP + "tr")
    for tr in rows[1:]:
        header_tbl.remove(tr)
    first_h = int(rows[0].find(HP + "tc/" + HP + "cellSz").get("height"))
    header_tbl.set("rowCnt", "1")
    header_tbl.find(HP + "sz").set("height", str(first_h))

    # 꼬리말 컨트롤을 머리 문단으로 옮겨 빈 줄 하나를 없앤다
    footer_ctrl = next(c for c in footer_para.iter(HP + "ctrl") if c.find(HP + "footer") is not None)
    head_para.find(HP + "run").append(footer_ctrl)

    for p in paras[1:]:
        sec.remove(p)
    for ls in head_para.findall(HP + "linesegarray"):
        head_para.remove(ls)  # 줄 배치는 한글이 열 때 다시 계산

    # 쪽 크기에서 문항 블록 높이 계산
    page = head_para.find(".//" + HP + "pagePr")
    m = page.find(HP + "margin").attrib
    body_h = int(page.get("height")) - sum(int(m[k]) for k in ("top", "bottom", "header", "footer"))
    body_w = int(page.get("width")) - int(m["left"]) - int(m["right"])
    col = head_para.find(".//" + HP + "colPr")
    sizes = col.findall(HP + "colSz")
    total = sum(int(s.get("width")) + int(s.get("gap")) for s in sizes)
    col_w = body_w * int(sizes[0].get("width")) // total
    notes_tbl = list(head_para.iter(HP + "tbl"))[1]
    notes_h = int(notes_tbl.find(HP + "sz").get("height"))
    first_top = first_h + 320 + notes_h + LINE_GAP  # 머리 표 + 안내 상자 줄
    block_first = (body_h - first_top) // 2 - LINE_GAP - SAFETY
    block_rest = body_h // 2 - LINE_GAP - SAFETY

    files["Contents/section0.xml"] = etree.tostring(sec, xml_declaration=True, encoding="UTF-8", standalone=True)

    # header.xml: 출처 글자 모양, 문단 모양 추가
    head = etree.fromstring(files["Contents/header.xml"])
    chars = head.find(".//" + HH + "charProperties")
    src_char = copy.deepcopy(chars.find(HH + "charPr[@id='18']"))
    src_char_id = str(len(chars))
    src_char.set("id", src_char_id)
    src_char.set("height", "800")
    src_char.set("textColor", "#6E6E73")
    chars.append(src_char)
    chars.set("itemCnt", str(len(chars)))

    paras_pr = head.find(".//" + HH + "paraProperties")
    source_para = add_para_pr(paras_pr, "30", "RIGHT")
    figure_para = add_para_pr(paras_pr, "30", "CENTER")
    block_para = add_para_pr(paras_pr, "30", "LEFT")
    files["Contents/header.xml"] = etree.tostring(head, xml_declaration=True, encoding="UTF-8", standalone=True)

    # 쓰지 않는 이미지 제거
    sec_text = files["Contents/section0.xml"].decode("utf-8")
    hpf = files["Contents/content.hpf"].decode("utf-8")
    for mm in re.finditer(r'<opf:item id="([^"]+)" href="(BinData/[^"]+)"[^>]*/>', hpf):
        if f'binaryItemIDRef="{mm.group(1)}"' not in sec_text:
            hpf = hpf.replace(mm.group(0), "")
            files.pop(mm.group(2), None)
    files["Contents/content.hpf"] = hpf.encode("utf-8")
    files.pop("Preview/PrvImage.png", None)
    files["Preview/PrvText.txt"] = "수학 기출 문항지".encode("utf-8")

    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), files.pop("mimetype"), compress_type=zipfile.ZIP_STORED)
        for name, data in files.items():
            z.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    tmp.unlink()

    style = {
        "stemPara": "30", "stemChar": "19",          # 발문 (굵게, 내어쓰기)
        "underlineChar": "23",                       # 발문 속 밑줄 (예: 틀린)
        "choicePara": "30", "choiceChar": "18",      # 선택지
        "tablePara": "31",                           # 선택지 표를 담는 문단
        "sourcePara": source_para, "sourceChar": src_char_id,  # 출처 줄
        "figurePara": figure_para,                   # 그림 (가운데)
        "blockPara": block_para,                     # 문항 블록을 담는 문단
        "blankPara": "30", "blankChar": "18",
        "choiceTable": {"borderFill": "6", "cellBorderFill": "1",
                        "cellWidths": [8410, 8410, 8409], "cellHeight": 1849,
                        "cellMargin": [510, 510, 141, 141]},
        "columnWidth": col_w,
        "blockWidth": col_w - 60,
        "blockHeightFirstPage": block_first,         # 1쪽: 머리 표·안내 상자 아래
        "blockHeight": block_rest,                   # 2쪽부터
        "perPage": 4,
    }
    Path(out).with_suffix(".json").write_text(json.dumps(style, ensure_ascii=False, indent=2), encoding="utf-8")
    print("template:", out, {k: style[k] for k in ("columnWidth", "blockHeightFirstPage", "blockHeight")})


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
