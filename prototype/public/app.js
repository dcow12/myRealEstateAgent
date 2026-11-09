import { analyzeLot, analyzeNeighborhood } from './lib/rules.js';
import { ZONES, STATE_RULES } from './lib/data.js';
import { SAMPLE_LOTS, syntheticNeighborhood } from './lib/lots.js';
import { explainReport } from './lib/explain.js';

const $ = (s, el = document) => el.querySelector(s);
const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NUM_FIELDS = ['lotWidthFt', 'lotDepthFt', 'houseWidthFt', 'houseDepthFt', 'houseFrontSetbackFt', 'primarySqft', 'otherStructuresSqft', 'obstructionSqft', 'garageSqft', 'basementSqft'];

const state = { lang: 'en', ami: 0.5, ai: false };

/* ---------- Tabs ---------- */
function showTab(which) {
  for (const [tab, view] of [['tab-lot', 'view-lot'], ['tab-hood', 'view-hood']]) {
    const on = tab === which;
    $('#' + tab).setAttribute('aria-selected', on);
    $('#' + view).hidden = !on;
  }
  if (which === 'tab-hood') renderHood();
}
$('#tab-lot').onclick = () => showTab('tab-lot');
$('#tab-hood').onclick = () => showTab('tab-hood');

/* ---------- My lot ---------- */
const form = $('#lot-form');
const zoneSel = form.elements.zone;
for (const [id, z] of Object.entries(ZONES)) zoneSel.add(new Option(`${id}: ${z.label}`, id));
const sampleSel = $('#sample');
for (const l of SAMPLE_LOTS) sampleSel.add(new Option(l.name, l.id));
sampleSel.add(new Option('From the neighborhood map…', '', false, false));
sampleSel.options[sampleSel.options.length - 1].disabled = true;

function fillForm(lot) {
  form.elements.zone.value = lot.zone;
  for (const f of NUM_FIELDS) form.elements[f].value = lot[f] ?? 0;
  form.elements.hasGarage.checked = !!lot.hasGarage;
  form.elements.hasBasement.checked = !!lot.hasBasement;
  syncIndent();
  renderLot();
}
function readForm() {
  const lot = { zone: form.elements.zone.value };
  for (const f of NUM_FIELDS) lot[f] = Math.max(0, Number(form.elements[f].value) || 0);
  lot.hasGarage = form.elements.hasGarage.checked;
  lot.hasBasement = form.elements.hasBasement.checked;
  return lot;
}
function syncIndent() {
  form.elements.garageSqft.disabled = !form.elements.hasGarage.checked;
  form.elements.basementSqft.disabled = !form.elements.hasBasement.checked;
}
sampleSel.onchange = () => fillForm(SAMPLE_LOTS.find((l) => l.id === sampleSel.value));
form.addEventListener('input', () => { syncIndent(); renderLot(); });
form.addEventListener('submit', (e) => e.preventDefault());

function renderLot() {
  const lot = readForm();
  if (lot.lotWidthFt < 10 || lot.lotDepthFt < 10) return;
  const report = analyzeLot(lot);
  renderVerdict(report);
  renderPlan(lot, report);
  renderOptions(report);
  renderReport(report);
}

function renderVerdict(r) {
  const v = $('#verdict');
  v.className = 'card verdict ' + r.verdict;
  const head = { yes: 'Yes, there\'s room for one more home.', maybe: 'Maybe. There\'s space, but it\'s too small.', no: 'Not under today\'s rules.' }[r.verdict];
  let html = `<div class="big">${head}</div>`;
  if (r.best) {
    const rr = r.best.rents.find((x) => x.amiPct === state.ami);
    html += `<div class="sub">Best option: ${esc(r.best.label)}, about ${r.best.sizeSqft} sq ft (${esc(r.best.unitType.toLowerCase())}).</div>
      <div class="kpis">
        <div class="kpi"><b>${usd(r.best.costLow / 1000)}k–${usd(r.best.costHigh / 1000)}k</b><span>rough cost</span></div>
        <div class="kpi"><b>${usd(rr.rent)}/mo</b><span>rent at ${state.ami * 100}% of area median</span></div>
        <div class="kpi"><b>${usd(r.best.marketRent)}/mo</b><span>typical market rent (HUD FMR)</span></div>
        <div class="kpi"><b>${rr.paybackYears} yrs</b><span>rough payback at that rent</span></div>
      </div>`;
  } else if (r.blockers.length) {
    html += `<div class="sub">What's in the way: the ${r.blockers.map((b) => esc(b.label)).join(', or the ')}. Changing that one rule would make it work.</div>`;
  } else {
    html += `<div class="sub">The lot itself is the limit. Relaxing any single rule wouldn't be enough.</div>`;
  }
  v.innerHTML = html;
}

function renderPlan(lot, r) {
  const z = ZONES[lot.zone];
  const W = lot.lotWidthFt, D = lot.lotDepthFt;
  const houseTop = D - lot.houseFrontSetbackFt - lot.houseDepthFt;
  const hx = (W - lot.houseWidthFt) / 2;
  const roomBottom = Math.max(z.rearSetbackFt, houseTop - z.separationFt);
  const roomW = Math.max(0, W - 2 * z.sideSetbackFt);
  const roomH = Math.max(0, roomBottom - z.rearSetbackFt);
  const det = r.options.find((o) => o.type === 'detached');
  const fs = Math.max(W, D) / 40;
  let adu = '';
  if (det.feasible) {
    let aw = Math.min(roomW, Math.ceil(Math.sqrt(det.sizeSqft) * 1.25));
    let ad = det.sizeSqft / aw;
    if (ad > roomH) { ad = roomH; aw = Math.min(roomW, det.sizeSqft / ad); }
    adu = `<rect x="${(W - aw) / 2}" y="${z.rearSetbackFt}" width="${aw}" height="${ad}" fill="var(--adu)" rx="1"/>
      <text x="${W / 2}" y="${z.rearSetbackFt + ad / 2}" font-size="${fs}" fill="var(--accent-ink)" text-anchor="middle" dominant-baseline="middle">${det.sizeSqft} sf</text>`;
  }
  const sideH = Math.max(0, houseTop);
  $('#plan').innerHTML = `
  <svg viewBox="${-fs} ${-fs * 2} ${W + fs * 2} ${D + fs * 5}" role="img" aria-label="Site plan: ${W} by ${D} foot lot. ${det.feasible ? `A ${det.sizeSqft} square foot cottage fits behind the house.` : 'No cottage fits behind the house.'}">
    <text x="${W / 2}" y="${-fs * 0.6}" font-size="${fs * 0.8}" fill="var(--muted)" text-anchor="middle">rear lot line · ${W} ft</text>
    <rect x="0" y="0" width="${W}" height="${D}" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <rect x="0" y="0" width="${W}" height="${Math.min(z.rearSetbackFt, D)}" fill="var(--setback)"/>
    <rect x="0" y="0" width="${Math.min(z.sideSetbackFt, W / 2)}" height="${sideH}" fill="var(--setback)"/>
    <rect x="${W - Math.min(z.sideSetbackFt, W / 2)}" y="0" width="${Math.min(z.sideSetbackFt, W / 2)}" height="${sideH}" fill="var(--setback)"/>
    ${houseTop > z.separationFt ? `<rect x="0" y="${houseTop - z.separationFt}" width="${W}" height="${z.separationFt}" fill="var(--setback)" opacity=".7"/>` : ''}
    ${roomH > 0 && roomW > 0 ? `<rect x="${z.sideSetbackFt}" y="${z.rearSetbackFt}" width="${roomW}" height="${roomH}" fill="var(--room)" stroke="var(--adu)" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke"/>` : ''}
    ${adu}
    <rect x="${hx}" y="${houseTop}" width="${lot.houseWidthFt}" height="${lot.houseDepthFt}" fill="var(--house)" rx="1"/>
    <text x="${W / 2}" y="${houseTop + lot.houseDepthFt / 2}" font-size="${fs}" fill="#fff" text-anchor="middle" dominant-baseline="middle">House</text>
    <rect x="${-fs}" y="${D + fs * 0.6}" width="${W + fs * 2}" height="${fs * 2}" fill="var(--line)"/>
    <text x="${W / 2}" y="${D + fs * 1.6}" font-size="${fs * 0.8}" fill="var(--muted)" text-anchor="middle" dominant-baseline="middle">street · lot depth ${D} ft</text>
  </svg>`;
}

function renderOptions(r) {
  $('#options tbody').innerHTML = r.options.map((o) => `
    <tr>
      <td>${esc(o.label)}</td>
      <td><span class="pill ${o.feasible ? 'yes' : 'no'}">${o.feasible ? 'Yes' : 'No'}</span></td>
      <td class="num">${o.feasible ? o.sizeSqft + ' sq ft' : '—'}</td>
      <td>${esc(o.limitedBy)}</td>
      <td class="num">${o.feasible ? `${usd(o.costLow / 1000)}k–${usd(o.costHigh / 1000)}k` : '—'}</td>
    </tr>`).join('');
}

let explainSeq = 0;
async function renderReport(r) {
  const lines = explainReport(r, state.lang, state.ami);
  const box = $('#report');
  const paint = (ls) => { box.innerHTML = ls.map((l, i) => `<p class="${i >= ls.length - (r.rulesVerified ? 1 : 2) ? 'fine' : ''}">${esc(l)}</p>`).join(''); };
  paint(lines);
  $('#report-src').textContent = `Written from the rules engine's numbers. ${STATE_RULES.source}`;
  if (!state.ai) return;
  const seq = ++explainSeq;
  clearTimeout(renderReport.t);
  renderReport.t = setTimeout(async () => {
    try {
      const res = await fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts: lines, lang: state.lang }) });
      const data = await res.json();
      if (seq !== explainSeq || !data.text) return;
      box.innerHTML = data.text.split(/\n+/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
      $('#report-src').textContent = `Reworded by ${data.source} from the rules engine's facts only. ${STATE_RULES.source}`;
    } catch { /* keep template */ }
  }, 600);
}

$('#ami').onchange = (e) => { state.ami = Number(e.target.value); renderLot(); };
for (const b of document.querySelectorAll('.seg button')) {
  b.onclick = () => {
    state.lang = b.dataset.lang;
    document.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    renderLot();
  };
}
$('#print').onclick = () => window.print();

/* ---------- Neighborhood ---------- */
const HOOD = syntheticNeighborhood();
const SLIDERS = [
  { key: 'rearSetbackFt', label: 'Rear setback', min: 0, max: 20, step: 1, fmt: (v) => `${v} ft` },
  { key: 'sideSetbackFt', label: 'Side setback', min: 0, max: 12, step: 1, fmt: (v) => `${v} ft` },
  { key: 'separationFt', label: 'Gap from main house', min: 0, max: 15, step: 1, fmt: (v) => `${v} ft` },
  { key: 'maxLotCoverage', label: 'Max lot coverage', min: 0.2, max: 0.6, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'minLotSqft', label: 'Minimum lot size', min: 0, max: 10000, step: 500, fmt: (v) => `${Number(v).toLocaleString()} sq ft` },
];
const overrides = {};
function baseRange(key, fmt) {
  const vals = Object.values(ZONES).map((z) => z[key]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}
$('#sliders').innerHTML = SLIDERS.map((s) => `
  <div class="slider">
    <div class="top-line"><label for="sl-${s.key}">${s.label}</label><output id="out-${s.key}">as written</output></div>
    <input type="range" id="sl-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${ZONES['RSF-65'][s.key]}">
    <div class="base">Current rules: ${baseRange(s.key, s.fmt)} by zone</div>
  </div>`).join('');
for (const s of SLIDERS) {
  $('#sl-' + s.key).oninput = (e) => {
    overrides[s.key] = Number(e.target.value);
    $('#out-' + s.key).textContent = `${s.fmt(overrides[s.key])} everywhere`;
    renderHood();
  };
}
$('#reset').onclick = () => {
  for (const s of SLIDERS) {
    delete overrides[s.key];
    $('#sl-' + s.key).value = ZONES['RSF-65'][s.key];
    $('#out-' + s.key).textContent = 'as written';
  }
  renderHood();
};

const BASELINE = analyzeNeighborhood(HOOD).ready;
function renderHood() {
  const n = analyzeNeighborhood(HOOD, () => overrides);
  const delta = n.ready - BASELINE;
  $('#hood-stats').innerHTML = `
    <div class="kpi"><b>${n.ready} / ${n.total}</b><span>lots that can hold one more home</span></div>
    <div class="kpi"><b>${delta >= 0 ? '+' : ''}${delta}</b><span>homes vs. current rules</span></div>
    <div class="kpi"><b>${n.total - n.ready}</b><span>lots still blocked</span></div>`;
  const max = Math.max(1, ...n.unlocks.map((u) => u.count));
  $('#unlocks').innerHTML = n.unlocks.length
    ? n.unlocks.map((u) => `<div class="bar"><span>Relax the ${esc(u.label)}</span><div class="track"><div class="fill" style="width:${(u.count / max) * 100}%"></div></div><b>+${u.count}</b></div>`).join('')
    : '<p class="muted">No single rule change unlocks more lots from here.</p>';
  renderHoodMap(n.results);
}

function renderHoodMap(results) {
  const STREET = 40, GAP = 4;
  const blocks = [...new Set(results.map((r) => r.lot.block))];
  let y = STREET, maxX = 0, out = '';
  const color = { yes: 'var(--ok)', maybe: 'var(--maybe)', no: 'var(--no)' };
  for (const b of blocks) {
    const north = results.filter((r) => r.lot.block === b && r.lot.side === 0);
    const south = results.filter((r) => r.lot.block === b && r.lot.side === 1);
    const depthN = Math.max(...north.map((r) => r.lot.lotDepthFt));
    const depthS = Math.max(...south.map((r) => r.lot.lotDepthFt));
    out += `<text x="0" y="${y - 12}" font-size="16" fill="var(--muted)">Block ${b + 1} · ${north[0].lot.zone}</text>`;
    for (const [row, isNorth] of [[north, true], [south, false]]) {
      let x = 0;
      for (const { lot, report } of row) {
        const ly = isNorth ? y : y + depthN + GAP + (depthS - lot.lotDepthFt);
        const label = `${lot.name}: ${report.verdict === 'yes' ? `${report.best.label}, ${report.best.sizeSqft} sq ft` : report.verdict === 'maybe' ? 'has space, too small' : 'blocked'}`;
        out += `<g class="lotg" data-id="${lot.id}" tabindex="0" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title>
          <rect x="${x}" y="${ly}" width="${lot.lotWidthFt - GAP}" height="${lot.lotDepthFt}" fill="${color[report.verdict]}" opacity=".85" rx="2"/>
          <rect x="${x + (lot.lotWidthFt - GAP - lot.houseWidthFt) / 2}" y="${isNorth ? ly + lot.houseFrontSetbackFt : ly + lot.lotDepthFt - lot.houseFrontSetbackFt - lot.houseDepthFt}" width="${lot.houseWidthFt}" height="${lot.houseDepthFt}" fill="var(--surface)" opacity=".85"/>
        </g>`;
        x += lot.lotWidthFt;
      }
      maxX = Math.max(maxX, x);
    }
    y += depthN + GAP + depthS + STREET * 1.6;
  }
  $('#hood-map').innerHTML = `<svg viewBox="-5 0 ${maxX + 10} ${y}" role="group" aria-label="Map of 4 made-up blocks, colored by whether each lot can hold an ADU. Select a lot to open it.">${out}</svg>`;
  for (const g of document.querySelectorAll('.lotg')) {
    const open = () => {
      const lot = HOOD.find((l) => l.id === g.dataset.id);
      sampleSel.value = '';
      fillForm(lot);
      showTab('tab-lot');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    g.style.cursor = 'pointer';
    g.onclick = open;
    g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  }
}

/* ---------- Boot ---------- */
fillForm(SAMPLE_LOTS[0]);
fetch('/api/status').then((r) => r.json()).then((s) => { state.ai = !!s.ai; if (state.ai) renderLot(); }).catch(() => {});
