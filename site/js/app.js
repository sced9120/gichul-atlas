import { buildExamHwpx, sortProblems } from './exam-hwpx.mjs';

const $ = id => document.getElementById(id);
const AREA = 'math';
const LS = `gichul:${AREA}:v1`, LS_OLD = 'gichul-atlas:v1';
const DATA = `/data/${AREA}/`;
const ORG = { kice: '평가원', edu: '교육청' };
const BANDS = [[0, 2.5, '2점대'], [2.5, 3.5, '3점대'], [3.5, 4.5, '4점대']];
const bandOf = p => (p < 2.5 ? 0 : p < 3.5 ? 1 : 2);
const fmtPts = p => (Number.isInteger(p) ? String(p) : String(p));

let problems = [], curriculum = null, byId = new Map();
let order = [];           // selected ids in tray order
const F = { q: '', subject: '', units: [], bands: [], pts: [], rmin: 0, rmax: 100, rnull: true, ymin: 0, ymax: 9999, orgs: [] };
let years = [];

const save = () => { try { localStorage.setItem(LS, JSON.stringify({ order, F, title: $('title').value, ans: $('ans').checked })); } catch {} };
const load = () => {
  try {
    let v = localStorage.getItem(LS);
    if (v == null) { // 예전 키(gichul-atlas:v1)에서 한 번 옮겨 온다
      const old = localStorage.getItem(LS_OLD);
      if (old != null) { localStorage.setItem(LS, old); localStorage.removeItem(LS_OLD); v = old; }
    }
    return JSON.parse(v || 'null');
  } catch { return null; }
};

// ---- URL <-> filters (과목은 pushState, 나머지는 replaceState)
const DEF = { q: '', subject: '', units: [], bands: [], pts: [], rmin: 0, rmax: 100, rnull: true, ymin: 0, ymax: 9999, orgs: [] };
function toQuery() {
  const u = new URLSearchParams();
  if (F.subject) u.set('subject', F.subject);
  F.units.forEach(x => u.append('unit', x));
  F.bands.forEach(x => u.append('band', x));
  F.pts.forEach(x => u.append('pts', x));
  F.orgs.forEach(x => u.append('org', x));
  if (F.q) u.set('q', F.q);
  if (F.rmin !== DEF.rmin) u.set('rmin', F.rmin);
  if (F.rmax !== DEF.rmax) u.set('rmax', F.rmax);
  if (!F.rnull) u.set('rnull', '0');
  if (years.length && F.ymin !== years[0]) u.set('ymin', F.ymin);
  if (years.length && F.ymax !== years[years.length - 1]) u.set('ymax', F.ymax);
  const s = u.toString(); return s ? '?' + s : '';
}
function fromQuery(search) {
  const u = new URLSearchParams(search), n = (k, d) => { const v = parseFloat(u.get(k)); return Number.isFinite(v) ? v : d; };
  return { q: u.get('q') || '', subject: u.get('subject') || '', units: u.getAll('unit'),
    bands: u.getAll('band').map(Number).filter(x => x >= 0 && x < BANDS.length), pts: u.getAll('pts').map(Number).filter(Number.isFinite),
    rmin: n('rmin', 0), rmax: n('rmax', 100), rnull: u.get('rnull') !== '0', ymin: n('ymin', 0), ymax: n('ymax', 9999), orgs: u.getAll('org') };
}
function syncUrl(push) {
  const url = location.pathname + toQuery();
  if (url === location.pathname + location.search) return;
  try { push ? history.pushState(null, '', url) : history.replaceState(null, '', url); } catch {}
}

// ---- HancomEQN -> readable text (preview only; the .hwpx keeps the real script)
function eqToHtml(s) {
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // quoted literals ("P", "는") are set aside first so their text is never rewritten; shown upright like rm
  const lits = [];
  let t = String(s).replace(/"([^"]*)"/g, (m, a) => { lits.push(a); return '\u0007' + (lits.length - 1) + '\u0008'; });
  t = t.replace(/\brm\b|\bit\b/g, ' ');
  const rep = [[/\bLEFT\b\s*/g, ''], [/\bRIGHT\b\s*/g, ''], [/\bLBRACE\b/g, '\u0005'], [/\bRBRACE\b/g, '\u0006'],
    [/\bcap\b/g, '∩'], [/\bcup\b/g, '∪'], [/\bsubset\b/g, '⊂'], [/\bin\b/g, '∈'], [/\bemptyset\b/g, '∅'],
    [/\bleq?\b|\ble\b/g, '≤'], [/\bgeq?\b|\bge\b/g, '≥'], [/\bneq?\b/g, '≠'], [/\btimes\b/g, '×'], [/\bpm\b/g, '±'],
    [/\binfty\b|\binf\b/g, '∞'], [/\balpha\b/g, 'α'], [/\bbeta\b/g, 'β'], [/\btheta\b/g, 'θ'], [/\bpi\b/g, 'π'],
    [/[`~]/g, ' ']];
  for (const [a, b] of rep) t = t.replace(a, b);
  // fractions: innermost first
  const grp = '\\{([^{}]*)\\}';
  for (let i = 0; i < 6; i++) {
    t = t.replace(new RegExp(grp + '\\s*over\\s*' + grp, 'g'), '($1)/($2)');
    t = t.replace(new RegExp('sqrt\\s*' + grp, 'g'), '√($1)');
    t = t.replace(new RegExp('\\^\\s*' + grp, 'g'), '\u0001$1\u0002');
    t = t.replace(new RegExp('_\\s*' + grp, 'g'), '\u0003$1\u0004');
  }
  t = t.replace(/\^\s*([-+]?\w)/g, '\u0001$1\u0002').replace(/_\s*(\w)/g, '\u0003$1\u0004');
  t = t.replace(/[{}]/g, ' ');                       // leftover grouping braces ({rm "P" it}) are invisible
  t = t.replace(/√\(\s*(\w+)\s*\)/g, '√$1');
  t = t.replace(/\(\s*([^()\/]*?)\s*\)\/\(\s*([^()\/]*?)\s*\)/g, (m, a, b) => (/^[\w.]+$/.test(a) && /^[\w.]+$/.test(b)) ? `${a}/${b}` : m);
  t = t.replace(/\s+/g, ' ').trim()
    .replace(/\s+([\u0001\u0003])/g, '$1')            // x ^{2} -> x²
    .replace(/([(\u0005])\s+/g, '$1').replace(/\s+([),\u0006])/g, '$1')
    .replace(/(^|[(,=<>≤≥∈⊂∩∪|\u0005]\s?)-\s+/g, '$1-')  // unary minus: "- 2" -> "-2"
    .replace(/(\d) (?=[A-Za-z√])/g, '$1')               // 2 x -> 2x, 2 √2 -> 2√2 (plain spaces are invisible in HancomEQN)
    .replace(/([A-Za-z\u0008]) \(/g, '$1(')                // n ( A ) -> n(A), A ( 1, 2 ) -> A(1, 2)
    .replace(/-/g, '−');
  t = esc(t).replace(/\u0001/g, '<sup>').replace(/\u0002/g, '</sup>').replace(/\u0003/g, '<sub>').replace(/\u0004/g, '</sub>')
    .replace(/\u0005/g, '{').replace(/\u0006/g, '}')
    .replace(/\u0007(\d+)\u0008/g, (m, i) => `<span class="rm">${esc(lits[+i])}</span>`);
  return `<span class="eq">${t}</span>`;
}
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function runsToHtml(runs) {
  return (runs || []).map(r => r.eq != null ? eqToHtml(r.eq) : (r.u ? `<u>${esc(r.t)}</u>` : esc(r.t ?? ''))).join('');
}
function runsPlain(runs) { return (runs || []).map(r => r.eq != null ? '' : (r.t ?? '')).join(''); }

// ---- filtering
const match = p => {
  if (F.subject && p.subject !== F.subject) return false;
  if (F.units.length && !F.units.includes(p.unit)) return false;
  if (F.bands.length && !F.bands.includes(bandOf(p.points))) return false;
  if (F.pts.length && !F.pts.includes(p.points)) return false;
  if (p.rate == null) { if (!F.rnull) return false; }
  else if (p.rate < F.rmin || p.rate > F.rmax) return false;
  if (p.src.year < F.ymin || p.src.year > F.ymax) return false;
  if (F.orgs.length && !F.orgs.includes(p.src.org)) return false;
  if (F.q) {
    const hay = (p.concepts.join(' ') + ' ' + p.unit + ' ' + runsPlain(p.stemRuns)).toLowerCase();
    if (!F.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
};
let shown = [];

// ---- UI building
function chip(container, name, value, label, checked, onChange, cls = '') {
  const l = document.createElement('label'); l.className = 'chip ' + cls;
  const i = document.createElement('input'); i.type = name === 'subject' ? 'radio' : 'checkbox'; i.name = name; i.checked = checked;
  const s = document.createElement('span'); s.textContent = label;
  i.addEventListener('change', () => onChange(i.checked, value, i));
  l.append(i, s); container.append(l); return i;
}
const toggle = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };

function buildFilters() {
  const fs = $('f-subject'); fs.textContent = '';
  chip(fs, 'subject', '', '전체', !F.subject, () => { F.subject = ''; F.units = []; buildUnits(); update(true); });
  const present = new Set(problems.map(p => p.subject));
  curriculum.subjects.filter(s => present.has(s.name)).forEach(s =>
    chip(fs, 'subject', s.name, s.name, F.subject === s.name, () => { F.subject = s.name; F.units = []; buildUnits(); update(true); }));
  buildUnits();

  const fb = $('f-band'); fb.textContent = '';
  BANDS.forEach(([, , lab], i) => chip(fb, 'band', i, lab, F.bands.includes(i), (on) => { toggle(F.bands, i, on); update(); }));
  const fp = $('f-pts'); fp.textContent = '';
  [...new Set(problems.map(p => p.points))].sort((a, b) => a - b).forEach(v =>
    chip(fp, 'pts', v, fmtPts(v) + '점', F.pts.includes(v), (on) => { toggle(F.pts, v, on); update(); }, 'sub'));

  const fo = $('f-org'); fo.textContent = '';
  Object.entries(ORG).forEach(([k, lab]) => chip(fo, 'org', k, lab, F.orgs.includes(k), (on) => { toggle(F.orgs, k, on); update(); }));

  years = [...new Set(problems.map(p => p.src.year))].sort((a, b) => a - b);
  for (const id of ['ymin', 'ymax']) {
    const sel = $(id); sel.textContent = '';
    years.forEach(y => sel.append(new Option(y + '년', y)));
  }
  if (!years.includes(F.ymin)) F.ymin = years[0];
  if (!years.includes(F.ymax)) F.ymax = years[years.length - 1];
  $('ymin').value = F.ymin; $('ymax').value = F.ymax;
  $('rmin').value = F.rmin; $('rmax').value = F.rmax; $('rnull').checked = F.rnull; $('q').value = F.q;
}
function buildUnits() {
  const g = $('g-unit'), c = $('f-unit'); c.textContent = '';
  const s = curriculum.subjects.find(s => s.name === F.subject);
  g.hidden = !s;
  if (s) s.units.forEach(u => chip(c, 'unit', u, u, F.units.includes(u), (on) => { toggle(F.units, u, on); update(); }, 'sub'));
}

function cardHtml(p) {
  const rate = p.rate == null ? '정답률 정보 없음' : `정답률 <b>${p.rate}%</b>`;
  const ch = (p.choiceRuns || []).map((r, i) => `<span><span class="n">${'①②③④⑤'[i]}</span>${runsToHtml(r)}</span>`).join('');
  const fig = p.figure ? `<div class="figure"><img src="${DATA}${esc(p.figure)}" alt="문항 그림" loading="lazy"></div>` : '';
  const img = p.image ? `<div class="figure"><img src="${DATA}${esc(p.image)}" alt="문항 이미지" loading="lazy"></div>` : '';
  return `<div class="phead">
      <input class="pick" type="checkbox" aria-label="${esc(p.source)} 선택" data-id="${esc(p.id)}">
      <div class="meta"><span class="src">${esc(p.source)}</span><span class="stats">${fmtPts(p.points)}점 · ${rate} · ${esc(p.type)}</span></div>
    </div>
    <div class="tags"><span class="tag unit">${esc(p.subject)} · ${esc(p.unit)}</span>${p.concepts.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div>
    <div class="stem">${runsToHtml(p.stemRuns)}</div>${fig}${img}
    ${ch ? `<div class="choices">${ch}</div>` : ''}
    <div class="pfoot"><button type="button" disabled title="곧 열립니다">분류 의견</button></div>`;
}

function renderGrid() {
  const g = $('grid'); g.textContent = '';
  if (!problems.length) { g.innerHTML = '<div class="empty">기출 문항을 옮기고 분류하는 중이에요. 매일 밤 새 문항이 추가돼요.</div>'; return; }
  if (!shown.length) { g.innerHTML = '<div class="empty">조건에 맞는 문항이 없습니다. 필터를 조금 넓혀 보세요.</div>'; return; }
  const frag = document.createDocumentFragment();
  for (const p of shown) {
    const d = document.createElement('article'); d.className = 'pcard'; d.dataset.id = p.id; d.innerHTML = cardHtml(p);
    frag.append(d);
  }
  g.append(frag); syncSel();
}
function syncSel() {
  const set = new Set(order);
  document.querySelectorAll('.pcard').forEach(c => {
    const on = set.has(c.dataset.id); c.classList.toggle('sel', on); c.querySelector('.pick').checked = on;
  });
}

function setSel(id, on) {
  const i = order.indexOf(id);
  if (on && i < 0) order.push(id); else if (!on && i >= 0) order.splice(i, 1);
}
function autoSort() { order = sortProblems(order.map(id => byId.get(id))).map(p => p.id); }

function renderTray() {
  $('tn').textContent = order.length; $('dl').disabled = !order.length;
  const ul = $('tlist'); ul.textContent = '';
  if (!order.length) { ul.innerHTML = '<li class="tray-empty">왼쪽에서 문항을 골라 담아 보세요.</li>'; return; }
  order.forEach((id, i) => {
    const p = byId.get(id); const li = document.createElement('li'); li.className = 'titem'; li.draggable = true; li.dataset.i = i;
    li.innerHTML = `<span class="grip" aria-hidden="true">⋮⋮</span><span class="no">${i + 1}</span>
      <span class="t">${esc(p.source)}<small>${fmtPts(p.points)}점 · ${esc(p.unit)}</small></span>
      <button type="button" aria-label="${esc(p.source)} 빼기">×</button>`;
    li.querySelector('button').addEventListener('click', () => { setSel(id, false); refreshSel(); });
    ul.append(li);
  });
}
let dragFrom = null;
$('tlist').addEventListener('dragstart', e => { const li = e.target.closest('.titem'); if (!li) return; dragFrom = +li.dataset.i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch {} });
$('tlist').addEventListener('dragover', e => { const li = e.target.closest('.titem'); if (!li || dragFrom == null) return; e.preventDefault(); document.querySelectorAll('.titem.over').forEach(x => x.classList.remove('over')); li.classList.add('over'); });
$('tlist').addEventListener('dragend', () => { dragFrom = null; document.querySelectorAll('.titem').forEach(x => x.classList.remove('over', 'dragging')); });
$('tlist').addEventListener('drop', e => {
  const li = e.target.closest('.titem'); if (!li || dragFrom == null) return; e.preventDefault();
  const to = +li.dataset.i; const [m] = order.splice(dragFrom, 1); order.splice(to, 0, m); dragFrom = null; refreshSel();
});

function refreshSel() { renderTray(); syncSel(); save(); }
function update(push = false) {
  shown = problems.filter(match);
  $('count').innerHTML = `<b>${shown.length}</b>개 문항 <span class="muted" style="font-weight:400">(전체 ${problems.length}개)</span>`;
  renderGrid(); save(); syncUrl(push);
}

// ---- events
$('grid').addEventListener('click', e => {
  const card = e.target.closest('.pcard'); if (!card) return;
  if (e.target.closest('.pfoot')) return;
  const id = card.dataset.id; const on = !order.includes(id);
  if (e.target.classList.contains('pick')) { setSel(id, e.target.checked); }
  else { setSel(id, on); }
  refreshSel();
});
$('selAll').addEventListener('click', () => { const ids = shown.map(p => p.id).filter(id => !order.includes(id)); if (ids.length) { order = sortProblems([...order, ...ids].map(id => byId.get(id))).map(p => p.id); } refreshSel(); });
$('selNone').addEventListener('click', () => { order = []; refreshSel(); });
$('autosort').addEventListener('click', () => { autoSort(); refreshSel(); });
$('title').addEventListener('input', save); $('ans').addEventListener('change', save);
$('q').addEventListener('input', e => { F.q = e.target.value.trim(); update(); });
const num = (id, key, d) => $(id).addEventListener('input', e => { const v = parseFloat(e.target.value); F[key] = Number.isFinite(v) ? v : d; update(); });
num('rmin', 'rmin', 0); num('rmax', 'rmax', 100);
$('rnull').addEventListener('change', e => { F.rnull = e.target.checked; update(); });
$('ymin').addEventListener('change', e => { F.ymin = +e.target.value; update(); });
$('ymax').addEventListener('change', e => { F.ymax = +e.target.value; update(); });
$('reset').addEventListener('click', () => {
  Object.assign(F, structuredClone(DEF));
  buildFilters(); update();
});

function setStatus(msg, err) { const s = $('status'); s.textContent = msg; s.classList.toggle('err', !!err); }
$('dl').addEventListener('click', async () => {
  if (!order.length) return;
  const btn = $('dl'); btn.disabled = true; setStatus('만드는 중…');
  try {
    const [template, style] = await Promise.all([
      fetch('/templates/exam-2col.hwpx').then(r => { if (!r.ok) throw new Error('양식 파일을 불러오지 못했습니다'); return r.arrayBuffer(); }),
      fetch('/templates/exam-2col.json').then(r => { if (!r.ok) throw new Error('양식 정보를 불러오지 못했습니다'); return r.json(); }),
    ]);
    if (!window.JSZip) throw new Error('JSZip을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요');
    const title = $('title').value.trim() || '수학 기출 문항지';
    const bytes = await buildExamHwpx({
      JSZip: window.JSZip, template, style, problems: order.map(id => byId.get(id)),
      loadImage: path => fetch(DATA + path).then(r => { if (!r.ok) throw new Error('그림을 불러오지 못했습니다'); return r.arrayBuffer(); }),
      options: { title, includeAnswers: $('ans').checked, sort: false },
    });
    const blob = new Blob([bytes], { type: 'application/x-hwpx' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = title.replace(/[\\/:*?"<>|]+/g, '_') + '.hwpx'; a.style.display = 'none'; document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
    setStatus('완료 — 파일을 내려받았습니다.');
  } catch (err) { console.error(err); setStatus('오류: ' + (err.message || err), true); }
  finally { btn.disabled = !order.length; }
});

// ---- init
(async () => {
  try {
    [problems, curriculum] = await Promise.all([fetch(DATA + 'problems.json').then(r => r.json()), fetch(DATA + 'curriculum.json').then(r => r.json())]);
  } catch (e) { $('grid').innerHTML = '<div class="empty">문항 데이터를 불러오지 못했습니다.</div>'; return; }
  byId = new Map(problems.map(p => [p.id, p]));
  const s = load();
  if (s) {
    if (s.F && !location.search) Object.assign(F, s.F);
    if (Array.isArray(s.order)) order = s.order.filter(id => byId.has(id));
    if (s.title) $('title').value = s.title;
    if (typeof s.ans === 'boolean') $('ans').checked = s.ans;
  }
  if (!s || !s.order) order = [];
  if (location.search) Object.assign(F, fromQuery(location.search));
  buildFilters(); update(); renderTray(); syncSel();
  window.addEventListener('popstate', () => {
    Object.assign(F, structuredClone(DEF), fromQuery(location.search));
    buildFilters(); shown = problems.filter(match);
    $('count').innerHTML = `<b>${shown.length}</b>개 문항 <span class="muted" style="font-weight:400">(전체 ${problems.length}개)</span>`;
    renderGrid(); save();
  });
})();
