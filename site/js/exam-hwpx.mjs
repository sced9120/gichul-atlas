/**
 * exam-hwpx.mjs — 선택한 문항으로 2단 시험지 HWPX를 브라우저에서 조립한다.
 *
 * - 서버·AI 호출 없음: 템플릿 HWPX(압축 파일) 안의 XML에 문단을 이어 붙이고 다시 압축할 뿐이다.
 * - 수식·출처 문구는 배포 단계(build_problems.py)에서 미리 만들어 둔다.
 * - 쪽 구성: 한 쪽 4문항(단마다 2문항). 문항마다 높이가 고정된 투명 블록에 넣어
 *   1번과 2번, 3번과 4번 사이에 풀이 공간이 생긴다.
 *
 * 사용 예 (브라우저)
 *   const bytes = await buildExamHwpx({ JSZip, template, style, problems,
 *     loadImage: p => fetch(p).then(r => r.arrayBuffer()), options: { title: '공통수학2 기출 문항지' } });
 *   saveAs(new Blob([bytes], { type: 'application/hwp+zip' }), '기출문항지.hwpx');
 */

const MARK = ['①', '②', '③', '④', '⑤'];
const HWP_PER_MM = 7200 / 25.4;

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtPts = n => (Math.round(n * 10) / 10).toString();

/** 배점 오름차순 → 같은 배점이면 정답률 내림차순(쉬운 문제 먼저) → 원래 선택 순서 */
export function sortProblems(list) {
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) =>
      (a.p.points - b.p.points) ||
      ((b.p.rate ?? -1) - (a.p.rate ?? -1)) ||
      (a.i - b.i))
    .map(x => x.p);
}

export async function buildExamHwpx({ JSZip, template, style: S, problems, loadImage, options = {} }) {
  const opt = {
    title: '수학 기출 문항지',
    subtitle: '이름 :                    학번 :              ',
    includeAnswers: true,
    sort: true,
    notes: ['※ 문항 번호는 1번부터 다시 매겼습니다.', '※ 문항마다 원래 시험의 출처를 적었습니다.', '※ 정답은 마지막 단에 있습니다.'],
    footerLeft: '각 문항의 출처는 문항 아래에 적혀 있습니다.',
    footerRight: '기출 아틀라스 · ',
    ...options,
  };
  const items = opt.sort ? sortProblems(problems) : [...problems];
  const perColumn = S.perPage / 2;

  const zip = await JSZip.loadAsync(template);
  let section = await zip.file('Contents/section0.xml').async('string');
  let hpf = await zip.file('Contents/content.hpf').async('string');

  let objId = 1800000000;
  let z = 1000;
  const nextId = () => objId++;

  // ---------- XML 조각 ----------
  const eqXml = r =>
    `<hp:equation id="${nextId()}" zOrder="${z++}" numberingType="EQUATION" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" version="Equation Version 60" baseLine="${r.bl ?? 86}" textColor="#000000" baseUnit="1000" lineMode="CHAR" font="HancomEQN">` +
    `<hp:sz width="${r.w}" widthRelTo="ABSOLUTE" height="${r.h}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="56" right="56" top="0" bottom="0"/><hp:shapeComment>수식입니다.</hp:shapeComment>` +
    `<hp:script>${esc(r.eq)}</hp:script></hp:equation>`;

  /** 글자·수식·밑줄 조각을 같은 글자 모양끼리 묶어 <hp:run>으로 만든다 */
  const richRuns = (charId, runs, prefix = '', suffix = '') => {
    const segs = [];
    if (prefix) segs.push([charId, `<hp:t>${esc(prefix)}</hp:t>`]);
    for (const r of runs) {
      if (r.eq != null) segs.push([charId, eqXml(r)]);
      else segs.push([r.u ? S.underlineChar : charId, `<hp:t>${esc(r.t)}</hp:t>`]);
    }
    if (suffix) segs.push([charId, `<hp:t>${esc(suffix)}</hp:t>`]);
    let xml = '', cur = null, buf = '';
    for (const [c, x] of segs) {
      if (c !== cur && cur !== null) { xml += `<hp:run charPrIDRef="${cur}">${buf}</hp:run>`; buf = ''; }
      cur = c; buf += x;
    }
    if (cur !== null) xml += `<hp:run charPrIDRef="${cur}">${buf}</hp:run>`;
    return xml || `<hp:run charPrIDRef="${charId}"><hp:t/></hp:run>`;
  };

  const run = (charId, body) => `<hp:run charPrIDRef="${charId}">${body || '<hp:t/>'}</hp:run>`;

  const para = (paraId, body, { columnBreak = false } = {}) =>
    `<hp:p id="0" paraPrIDRef="${paraId}" styleIDRef="0" pageBreak="0" columnBreak="${columnBreak ? 1 : 0}" merged="0">${body}</hp:p>`;

  /** 테두리 없는 배치용 표: rows = [[셀 안 문단 XML, ...], ...] */
  const table = (rows, widths, { vAlign = 'CENTER', minHeight = S.choiceTable.cellHeight, margin = S.choiceTable.cellMargin } = {}) => {
    const [ml, mr, mt, mb] = margin;
    const total = widths.reduce((a, b) => a + b, 0);
    const trs = rows.map((cells, ri) => '<hp:tr>' + cells.map((cell, ci) =>
      `<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${S.choiceTable.cellBorderFill}">` +
      `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${vAlign}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${cell}</hp:subList>` +
      `<hp:cellAddr colAddr="${ci}" rowAddr="${ri}"/><hp:cellSpan colSpan="1" rowSpan="1"/>` +
      `<hp:cellSz width="${widths[ci]}" height="${minHeight}"/><hp:cellMargin left="${ml}" right="${mr}" top="${mt}" bottom="${mb}"/></hp:tc>`
    ).join('') + '</hp:tr>').join('');
    return `<hp:tbl id="${nextId()}" zOrder="${z++}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${widths.length}" cellSpacing="0" borderFillIDRef="${S.choiceTable.borderFill}" noAdjust="0">` +
      `<hp:sz width="${total}" widthRelTo="ABSOLUTE" height="${minHeight * rows.length}" heightRelTo="ABSOLUTE" protect="0"/>` +
      `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="0" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
      `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>${trs}</hp:tbl>`;
  };

  const picXml = (binId, w, h) =>
    `<hp:pic textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" reverse="0" id="${nextId()}" zOrder="${z++}" numberingType="PICTURE" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="${objId}">` +
    `<hp:offset x="0" y="0"/><hp:orgSz width="${w}" height="${h}"/><hp:curSz width="${w}" height="${h}"/><hp:flip horizontal="0" vertical="0"/>` +
    `<hp:rotationInfo angle="0" centerX="${w >> 1}" centerY="${h >> 1}" rotateimage="1"/>` +
    `<hp:renderingInfo><hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/><hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>` +
    `<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="${w}" y="0"/><hc:pt2 x="${w}" y="${h}"/><hc:pt3 x="0" y="${h}"/></hp:imgRect>` +
    `<hp:imgClip left="0" right="${w}" top="0" bottom="${h}"/><hp:inMargin left="0" right="0" top="0" bottom="0"/><hp:imgDim dimwidth="${w}" dimheight="${h}"/>` +
    `<hc:img binaryItemIDRef="${binId}" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/><hp:effects/>` +
    `<hp:sz width="${w}" widthRelTo="ABSOLUTE" height="${h}" heightRelTo="ABSOLUTE" protect="0"/>` +
    `<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>` +
    `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:shapeComment>그림입니다.</hp:shapeComment></hp:pic>`;

  // 그림: 한글 방식대로 BIN0001.png 이름 + content.hpf 목록 + header.xml binDataList 에 함께 등록.
  // (binDataList 가 없거나 이름이 BIN#### 꼴이 아니면 모바일 한글 뷰어 등에서 자리만 잡히고 그림이 안 보인다.)
  let imgNo = 0;
  const binItems = [];
  const embedImage = async path => {
    imgNo += 1;
    const ext = path.split('.').pop().toLowerCase();
    const binId = `BIN${String(imgNo).padStart(4, '0')}`;
    zip.file(`BinData/${binId}.${ext}`, await loadImage(path), { createFolders: false });
    hpf = hpf.replace('</opf:manifest>',
      `<opf:item id="${binId}" href="BinData/${binId}.${ext}" media-type="image/${ext === 'jpg' ? 'jpeg' : ext}" isEmbeded="1"/></opf:manifest>`);
    binItems.push(`<hh:binItem id="${imgNo - 1}" Type="Embedding" BinData="${binId}.${ext}" Format="${ext}"/>`);
    return binId;
  };

  // ---------- 문항 블록 ----------
  const choiceCell = (k, runs) => para(S.choicePara, richRuns(S.choiceChar, runs, `${MARK[k]} `));
  const out = [];

  for (const [i, p] of items.entries()) {
    const no = i + 1;
    const inner = [];

    if (p.image) {
      // 문항 전체가 그림인 경우: [번호 | 그림]
      const binId = await embedImage(p.image);
      const numW = 1700, w = S.blockWidth - numW - 300;
      const h = Math.round(w * p.imageSize[1] / p.imageSize[0]);
      inner.push(para(S.stemPara, run(S.stemChar, table(
        [[para(S.stemPara, run(S.stemChar, `<hp:t>${no}.</hp:t>`)), para(S.choicePara, run(S.choiceChar, picXml(binId, w, h)))]],
        [numW, w + 200], { vAlign: 'TOP', minHeight: h, margin: [0, 0, 0, 0] }))));
    } else {
      // 발문: "N. ... [3.5점]"
      inner.push(para(S.stemPara, richRuns(S.stemChar, p.stemRuns, `${no}. `, ` [${fmtPts(p.points)}점]`)));
      // 그림: 그림 부분만 이미지로, 가운데
      if (p.figure) {
        const binId = await embedImage(p.figure);
        const w = Math.round((p.figureWidthMm ?? 40) * HWP_PER_MM);
        const h = Math.round(w * p.figureSize[1] / p.figureSize[0]);
        inner.push(para(S.figurePara, run(S.choiceChar, picXml(binId, w, h))));
      }
      if (p.choiceRuns) {
        if (p.choiceLayout === 'grid3') {
          const cells = p.choiceRuns.map((runs, k) => choiceCell(k, runs));
          const emptyCell = para(S.choicePara, run(S.choiceChar, ''));
          inner.push(para(S.tablePara,
            run(S.choiceChar, table([cells.slice(0, 3), [cells[3], cells[4], emptyCell]], S.choiceTable.cellWidths))));
        } else {
          p.choiceRuns.forEach((runs, k) => inner.push(para(S.choicePara, richRuns(S.choiceChar, runs, ` ${MARK[k]} `))));
        }
      }
    }
    // 출처 줄 (작은 회색, 오른쪽 정렬)
    inner.push(para(S.sourcePara, run(S.sourceChar, `<hp:t>출처 · ${esc(p.source)}</hp:t>`)));

    // 높이 고정 블록: 단마다 2개 → 위 문항 아래에 풀이 공간
    const h = i < S.perPage ? S.blockHeightFirstPage : S.blockHeight;
    const block = table([[inner.join('')]], [S.blockWidth], { vAlign: 'TOP', minHeight: h, margin: [0, 0, 0, 0] });
    out.push(para(S.blockPara, run(S.choiceChar, block), { columnBreak: i > 0 && i % perColumn === 0 }));
  }

  // ---------- 정답 ----------
  if (opt.includeAnswers) {
    out.push(para(S.stemPara, run(S.stemChar, '<hp:t>정답</hp:t>'), { columnBreak: true }));
    for (let i = 0; i < items.length; i += 5) {
      const line = items.slice(i, i + 5)
        .map((p, k) => `${i + k + 1}. ${p.type === '선택형' && p.answer >= 1 && p.answer <= 5 ? MARK[p.answer - 1] : (p.answer ?? '-')}`)
        .join('     ');
      out.push(para(S.choicePara, run(S.choiceChar, `<hp:t>${esc(line)}</hp:t>`)));
    }
  }

  // ---------- 머리 표·꼬리말 ----------
  const fill = {
    TITLE: opt.title, SUBTITLE: opt.subtitle,
    NOTE1: opt.notes[0] ?? '', NOTE2: opt.notes[1] ?? '', NOTE3: opt.includeAnswers ? (opt.notes[2] ?? '') : '',
    FOOTER1: opt.footerLeft, FOOTER2: opt.footerRight,
  };
  section = section.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, k) => esc(fill[k] ?? ''));
  section = section.replace('</hs:sec>', out.join('') + '</hs:sec>');

  if (binItems.length) {
    let header = await zip.file('Contents/header.xml').async('string');
    header = header.replace(/<hh:binDataList[^>]*\/>|<hh:binDataList[\s\S]*?<\/hh:binDataList>/, '');
    header = header.replace('</hh:refList>',
      `<hh:binDataList itemCnt="${binItems.length}">${binItems.join('')}</hh:binDataList></hh:refList>`);
    zip.file('Contents/header.xml', header, { createFolders: false });
  }
  zip.file('Contents/section0.xml', section, { createFolders: false });
  zip.file('Contents/content.hpf', hpf, { createFolders: false });
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/hwp+zip' });
}
