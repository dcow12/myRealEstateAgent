'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertCircle, ArrowRight, ArrowUpRight, ArrowRightLeft, ArrowUp, ChevronRight, CornerDownRight, Info, LoaderCircle, Maximize2,
  Mic, Moon, RotateCcw, Search, Sun, Volume2, VolumeX, X,
} from 'lucide-react';
import { BASE_POLICY, cityStats, evaluate, SETBACK_STEPS, SEPARATION_STEPS, type Policy, type Verdict } from '@/lib/engine/rules.ts';
import { ROLES, ROLE_ORDER } from '@/lib/agents/roles.ts';
import type { CSSProperties } from 'react';
import { verdictsFor, VERDICT_COLORS } from '@/lib/town/geometry.ts';
import type { TownData, AgentId, ChatTurn, AgentResponse, AgentAction, AgentMode } from '@/lib/town/types.ts';

const TownScene = dynamic(() => import('./TownScene.tsx'), {
  ssr: false,
  loading: () => <div className="scene-loading"><span><LoaderCircle size={14} className="spin" aria-hidden /> Building 3D model</span></div>,
});

type Msg = ChatTurn & { actions?: AgentAction[]; tools?: AgentResponse['tools']; note?: string; error?: boolean };
type Pane = 'city' | 'agent';
type Results = Extract<AgentAction, { type: 'results' }>;

const CITY_HALL: [number, number] = [-1134, -4976];
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const k = (n: number) => '$' + Math.round(n / 1000) + 'k';
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0).toFixed(1) + '%';

/** Zillow's address search URL, e.g. /homes/5021-Lakeland-Rd,-College-Park,-MD-20740_rb/ */
const zillow = (addr: string, cityLine?: string) =>
  `https://www.zillow.com/homes/${[addr, cityLine ?? 'College Park, MD'].join(', ').replace(/[^A-Za-z0-9,]+/g, '-')}_rb/`;

const VERDICT_ORDER: Verdict[] = ['yes', 'maybe', 'no', 'review'];
const VERDICT_LABEL: Record<Verdict, string> = { yes: 'Fits a unit', maybe: 'Almost', no: 'Blocked', review: 'Review' };
const VERDICT_LINE: Record<Verdict, string> = {
  yes: 'Can add a unit',
  maybe: 'Space found, but below the 250 sq ft minimum unit',
  no: 'Blocked',
  review: 'Needs manual review',
};
const MODE_LABEL: Record<AgentMode, string> = { gemini: 'Gemini', claude: 'Claude', offline: 'Rules only' };
const MODE_TITLE: Record<AgentMode, string> = {
  gemini: 'Agents write answers with Gemini. Every figure comes from myRealEstateAgent tools.',
  claude: 'Agents write answers with Claude. Every figure comes from myRealEstateAgent tools.',
  offline: 'No model key configured. Agents answer from rules-engine templates.',
};

/** Wordmark: a lot outline with a second, smaller unit in its rear corner. */
const Mark = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
    <rect x="1.5" y="1.5" width="17" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="4.5" y="9" width="7" height="6.5" rx="1" fill="currentColor" />
    <rect x="12.5" y="4" width="3.5" height="3.5" rx="0.75" fill="var(--accent)" />
  </svg>
);

/** "myRealEstate" + boxed "Agent": letters rise through a baseline mask and dip like piano keys on hover. */
function Wordmark() {
  let n = 0;
  return (
    <span className="wm" aria-label="myRealEstateAgent" role="img">
      {(['myRealEstate', 'Agent'] as const).map((w) => (
        <span key={w} className={`wm-word${w === 'Agent' ? ' boxed' : ''}`} aria-hidden>
          {Array.from(w).map((ch, i) => <span key={i} className="ltr" style={{ '--i': n++ } as CSSProperties}><span className="ltr-in">{ch}</span></span>)}
        </span>
      ))}
    </span>
  );
}

function argText(input: unknown): string {
  if (input == null || (typeof input === 'object' && !Object.keys(input as object).length)) return '';
  const s = JSON.stringify(input);
  return s.length > 90 ? s.slice(0, 87) + '…' : s;
}

function Boot({ error }: { error?: string }) {
  return (
    <div className="boot">
      <div className="boot-card" role={error ? 'alert' : 'status'}>
        <div className="wordmark"><Mark size={22} /> <Wordmark /></div>
        {error ? (
          <>
            <p>Parcel data could not be loaded ({error}).</p>
            <p>Generate it with <code>npm run fetch-data</code> then <code>npm run analyze</code>, and reload.</p>
          </>
        ) : (
          <>
            <p>Loading parcel data for College Park, MD</p>
            <div className="progress"><i /></div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [town, setTown] = useState<TownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [policy, setPolicy] = useState<Policy>(BASE_POLICY);
  const [active, setActive] = useState<AgentId>('surveyor');
  const [threads, setThreads] = useState<Record<AgentId, Msg[]>>(() =>
    Object.fromEntries(ROLE_ORDER.map((id) => [id, []])) as unknown as Record<AgentId, Msg[]>);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [handoff, setHandoff] = useState<{ from: AgentId; summary: string } | null>(null);
  const [mode, setMode] = useState<AgentMode | null>(null);
  const [voice, setVoice] = useState(false);
  const [flyKey, setFlyKey] = useState(0);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(document.documentElement.dataset.theme === 'dark'); }, []);
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theming');
    setDark((d) => {
      const next = !d;
      if (next) root.dataset.theme = 'dark'; else root.removeAttribute('data-theme');
      try { localStorage.setItem('myrealestateagent-theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
    window.setTimeout(() => root.classList.remove('theming'), 300);
  }, []);
  const [pane, setPane] = useState<Pane>('city');
  const [rulesOpen, setRulesOpen] = useState(true);
  const [values, setValues] = useState<Record<string, number>>({});
  const [mailing, setMailing] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Results | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/data/town.json').then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setTown).catch((e) => setError((e as Error).message));
    fetch('/data/values.json').then((r) => (r.ok ? r.json() : {})).then(setValues).catch(() => {});
    fetch('/data/mailing.json').then((r) => (r.ok ? r.json() : {})).then(setMailing).catch(() => {});
    fetch('/api/agents/surveyor').then((r) => r.json()).then((d) => setMode(d.mode)).catch(() => setMode('offline'));
  }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [threads, active, busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const verdicts = useMemo(() => (town ? verdictsFor(town, policy) : []), [town, policy]);
  const stats = useMemo(() => (town ? cityStats(town.lots, policy) : null), [town, policy]);
  const base = useMemo(() => (town ? cityStats(town.lots, BASE_POLICY) : null), [town]);
  const lot = town && selected != null ? town.lots[selected] : null;
  const report = lot ? evaluate(lot, policy) : null;
  const value = lot ? values[String(lot.id)] : undefined;

  const speak = useCallback((text: string) => {
    if (!voice || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, [voice]);

  const switchAgent = useCallback((to: AgentId) => {
    setPane('agent');
    if (to === active) return;
    const last = [...threads[active]].reverse().find((m) => m.role === 'assistant' && !m.error);
    setHandoff(last ? { from: active, summary: last.text } : null);
    setActive(to);
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [active, threads]);

  // Selecting a lot folds the rule controls to a one-line summary so the lot's facts stay in view.
  const select = useCallback((i: number | null) => { setSelected(i); setFlyKey((n) => n + 1); setRulesOpen(i == null); }, []);

  const applyActions = useCallback((actions: AgentAction[]) => {
    for (const a of actions) {
      if (a.type === 'focus') select(a.lotIndex);
      if (a.type === 'policy') setPolicy({ ...BASE_POLICY, ...a.policy });
      if (a.type === 'results') setResults(a);
    }
  }, [select]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const id = active;
    const thread: Msg[] = [...threads[id], { role: 'user', text: t }];
    setThreads((s) => ({ ...s, [id]: thread }));
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ thread: thread.filter((m) => !m.error).map(({ role, text }) => ({ role, text })), lotIndex: selected, policy, handoff }),
      });
      const data: AgentResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // A one-off fallback (data.note set) doesn't change which model is configured; the note on the answer says what happened.
      if (!data.note) setMode(data.mode);
      applyActions(data.actions);
      setHandoff(null);
      setThreads((s) => ({ ...s, [id]: [...s[id], { role: 'assistant', text: data.reply, actions: data.actions, tools: data.tools, note: data.note }] }));
      speak(data.reply);
    } catch (e) {
      setThreads((s) => ({ ...s, [id]: [...s[id], { role: 'assistant', error: true, text: `Request failed: ${(e as Error).message}. Try again.` }] }));
    } finally {
      setBusy(false);
    }
  }, [active, threads, busy, selected, policy, handoff, applyActions, speak]);

  const listen = useCallback(() => {
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) {
      setThreads((s) => ({ ...s, [active]: [...s[active], { role: 'assistant', error: true, text: 'Voice input is not supported in this browser. Type your question instead.' }] }));
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.onresult = (ev: any) => send(ev.results[0][0].transcript);
    rec.start();
  }, [send, active]);

  const matches = useMemo(() => {
    if (!town || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const out: number[] = [];
    for (let i = 0; i < town.lots.length && out.length < 8; i++) if (town.lots[i].addr.toLowerCase().includes(q)) out.push(i);
    return out;
  }, [town, query]);
  useEffect(() => setHi(0), [query]);
  const pick = (i: number) => { select(i); setQuery(''); searchRef.current?.blur(); setPane('city'); };

  if (error) return <Boot error={error} />;
  if (!town || !stats || !base) return <Boot />;

  const role = ROLES[active];
  const thread = threads[active];
  const lastLine = [...thread].reverse().find((m) => m.role === 'assistant' && !m.error)?.text ?? '';
  const changed = JSON.stringify(policy) !== JSON.stringify(BASE_POLICY);
  const changes = [
    policy.setbackFt !== BASE_POLICY.setbackFt && `setback ${policy.setbackFt} ft (baseline ${BASE_POLICY.setbackFt})`,
    policy.separationFt !== BASE_POLICY.separationFt && `house gap ${policy.separationFt} ft (baseline ${BASE_POLICY.separationFt})`,
    policy.coverageBonus !== BASE_POLICY.coverageBonus && `coverage +${Math.round(policy.coverageBonus * 100)} pts`,
    policy.maxAduSqft !== BASE_POLICY.maxAduSqft && `size cap ${policy.maxAduSqft.toLocaleString()} sq ft (baseline ${BASE_POLICY.maxAduSqft.toLocaleString()})`,
    policy.requireMinLot !== BASE_POLICY.requireMinLot && 'zone minimum lot size required',
  ].filter(Boolean) as string[];
  const blockedByLot = role.needsLot && selected == null;
  const unasked = role.suggestions.filter((q) => !thread.some((t) => t.role === 'user' && t.text === q));
  const agentState = busy ? 'busy' : blockedByLot ? 'waiting' : 'ready';
  const m = mode ?? 'offline';

  return (
    <div className="app" data-pane={pane}>
      {/* ---------- Top bar ---------- */}
      <header className="bar">
        <div className="wordmark"><Mark size={20} /> <Wordmark /></div>
        <span className="crumb" aria-hidden>/</span>
        <span className="place">College Park, MD</span>
        <div className="search">
          <div className="field">
            <Search size={14} aria-hidden />
            <input
              ref={searchRef}
              aria-label="Search addresses"
              placeholder="Search addresses"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              role="combobox"
              aria-expanded={query.trim().length >= 2}
              aria-controls="address-results"
              aria-activedescendant={matches.length ? `addr-${matches[hi]}` : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                if (e.key === 'Enter' && matches[hi] != null) pick(matches[hi]);
                if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); }
              }}
            />
            <kbd aria-hidden>/</kbd>
          </div>
          {query.trim().length >= 2 && (
            <ul className="results" role="listbox" id="address-results">
              {matches.length === 0 && <li className="none" role="option" aria-selected={false}>No single-family address matches “{query.trim()}”.</li>}
              {matches.map((i, j) => (
                <li key={i} id={`addr-${i}`} role="option" aria-selected={j === hi} onMouseEnter={() => setHi(j)} onMouseDown={(e) => { e.preventDefault(); pick(i); }}>
                  <i className="dot" style={{ background: VERDICT_COLORS[verdicts[i]] }} aria-hidden />
                  {town.lots[i].addr}
                  <span className="verdict-label">{VERDICT_LABEL[verdicts[i]]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bar-end">
          <span style={{ '--i': 0 } as CSSProperties} className={`status ${m}`} title={MODE_TITLE[m]} role="status" aria-label={`Agent model: ${MODE_LABEL[m]}`}><i aria-hidden /><span aria-hidden>{MODE_LABEL[m]}</span></span>
          <button style={{ '--i': 1 } as CSSProperties} className="theme-toggle" onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* ---------- Sidebar: city, rules, lot ---------- */}
      <aside className="side" aria-label="City and lot details">
        <section className="section" aria-labelledby="h-city">
          <div className="section-head">
            <h2 id="h-city">Single-family lots</h2>
            <span className="meta num">{stats.homes.toLocaleString()} scanned</span>
          </div>
          <p className="summary"><strong className="num">{stats.yes.toLocaleString()}</strong> lots ({pct(stats.yes, stats.homes)}) can add an accessory unit {changed ? <>with {changes.join(', ')}</> : 'under baseline rules'}.</p>
          <table className="vtable">
            <thead>
              <tr><th scope="col">Verdict</th><th scope="col">Lots</th><th scope="col" className="share">Share</th>{changed ? <th scope="col" className="share">Change</th> : <th scope="col" className="bar-cell"><span className="sr-only">Distribution</span></th>}</tr>
            </thead>
            <tbody>
              {VERDICT_ORDER.map((v) => {
                const d = stats[v] - base[v];
                return (
                  <tr key={v}>
                    <td><span className="label"><i className="dot" style={{ background: VERDICT_COLORS[v] }} aria-hidden />{VERDICT_LABEL[v]}</span></td>
                    <td>{stats[v].toLocaleString()}</td>
                    <td className="share muted">{pct(stats[v], stats.homes)}</td>
                    {changed
                      ? <td className="share"><span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'zero'}`}>{d > 0 ? '+' : ''}{d}</span></td>
                      : <td className="bar-cell"><span className="meter" aria-hidden><i style={{ width: pct(stats[v], stats.homes), background: VERDICT_COLORS[v] }} /></span></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="section" aria-labelledby="h-rules">
          <div className="section-head">
            <h2 id="h-rules">
              <button className="disclosure" aria-expanded={rulesOpen} aria-controls="rules-body" onClick={() => setRulesOpen((o) => !o)}>
                <ChevronRight size={14} aria-hidden />Rule what-ifs
              </button>
            </h2>
            <button className="btn ghost sm" onClick={() => setPolicy(BASE_POLICY)} disabled={!changed}><RotateCcw size={12} aria-hidden /> Reset</button>
          </div>
          {!rulesOpen && <p className="rules-summary">{changed ? changes.join(' · ') : 'Baseline rules'}</p>}
          <div className="rules" id="rules-body" hidden={!rulesOpen}>
            <div className="rule">
              <div className="rule-label" id="r-setback"><span>Side and rear setback</span><span className="value">{policy.setbackFt} ft</span></div>
              <div className="seg" role="group" aria-labelledby="r-setback">
                {SETBACK_STEPS.map((v) => <button key={v} type="button" aria-pressed={policy.setbackFt === v} onClick={() => setPolicy({ ...policy, setbackFt: v })}>{v} ft</button>)}
              </div>
              <p className="hint">County rule for a 15 ft accessory building: 5 ft.</p>
            </div>
            <div className="rule">
              <div className="rule-label" id="r-gap"><span>Gap from main house</span><span className="value">{policy.separationFt} ft</span></div>
              <div className="seg" role="group" aria-labelledby="r-gap">
                {SEPARATION_STEPS.map((v) => <button key={v} type="button" aria-pressed={policy.separationFt === v} onClick={() => setPolicy({ ...policy, separationFt: v })}>{v} ft</button>)}
              </div>
              <p className="hint">6 ft is an assumption pending CB-074-2026.</p>
            </div>
            <div className="rule">
              <label htmlFor="r-cov"><span>Extra lot coverage</span><span className="value">+{Math.round(policy.coverageBonus * 100)} pts</span></label>
              <input id="r-cov" type="range" min={0} max={0.2} step={0.05} value={policy.coverageBonus} onChange={(e) => setPolicy({ ...policy, coverageBonus: +e.target.value })} />
            </div>
            <div className="rule">
              <label htmlFor="r-cap"><span>Local size cap</span><span className="value">{policy.maxAduSqft.toLocaleString()} sq ft</span></label>
              <input id="r-cap" type="range" min={400} max={1500} step={100} value={policy.maxAduSqft} onChange={(e) => setPolicy({ ...policy, maxAduSqft: +e.target.value })} />
              <p className="hint">State law also caps a unit at 75% of the main house.</p>
            </div>
            <label className="check"><input type="checkbox" checked={policy.requireMinLot} onChange={(e) => setPolicy({ ...policy, requireMinLot: e.target.checked })} /> Require the zone's minimum lot size</label>
          </div>
        </section>

        <section className="section" aria-labelledby="h-lot" aria-live="polite">
          <div className="section-head"><h2 id="h-lot">Selected lot</h2></div>
          {!lot || !report ? (
            <div className="empty">
              <strong>No lot selected</strong>
              <span>Click a lot on the map or search an address.<span className="kbd-hint"> Press <kbd>/</kbd> to search.</span></span>
            </div>
          ) : (
            <div className="lot-in" key={selected}>
              <div className="lot-title">
                <h3>{lot.addr || 'No street address on record'}</h3>
                <span className="lot-actions">
                  {lot.addr && (
                    <a className="btn sm" href={zillow(lot.addr, mailing[String(lot.id)])} target="_blank" rel="noopener noreferrer" title="Open this address on Zillow in a new tab">
                      Zillow <ArrowUpRight size={12} aria-hidden />
                    </a>
                  )}
                  <button className="btn ghost icon" aria-label="Clear selection" title="Clear selection" onClick={() => select(null)}><X size={14} /></button>
                </span>
              </div>
              <p className="lot-meta num">{lot.zone} · {lot.lotSqft.toLocaleString()} sq ft lot{lot.year ? ` · built ${lot.year}` : ''}{lot.rings > 1 ? ` · ${lot.rings} platted lots` : ''}</p>
              <p className="verdict"><i className="dot" style={{ background: VERDICT_COLORS[report.verdict] }} aria-hidden />{VERDICT_LINE[report.verdict]}{report.verdict === 'yes' || report.verdict === 'no' ? (changed ? ' with the rule changes above' : ' under baseline rules') : ''}</p>
              <dl className="kv">
                <dt>Assessed value</dt><dd>{value && value >= 20000 ? usd(value) : 'No county record'}</dd>
                {report.best ? (
                  <>
                    <dt>Unit</dt><dd className="unit">{report.best.label}, {report.best.unit.toLowerCase()}</dd>
                    <dt>Size</dt><dd>{report.best.sqft.toLocaleString()} sq ft</dd>
                    <dt>Est. cost</dt><dd>{k(report.best.costLow)}–{k(report.best.costHigh)}</dd>
                    <dt>Rent, 50% AMI</dt><dd>{usd(report.best.rents[0].rent)}/mo</dd>
                    <dt>Market rent</dt><dd>{usd(report.best.marketRent)}/mo</dd>
                  </>
                ) : null}
                <dt>Limited by</dt><dd>{report.limitedBy}</dd>
              </dl>
              {lot.scan === 'estimated' && <p className="note"><Info size={13} aria-hidden />House outline estimated from county living area; site figures are approximate.</p>}
              {lot.historic && <p className="note"><Info size={13} aria-hidden />In a historic district. Exterior work may need preservation review.</p>}
              <div className="ask-row">
                <span>Ask</span>
                {ROLE_ORDER.filter((r) => r !== 'planner').map((r) => (
                  <button key={r} className="btn sm" onClick={() => switchAgent(r)}>{ROLES[r].name}</button>
                ))}
              </div>
            </div>
          )}
        </section>

        <details className="sources">
          <summary>Sources and limitations</summary>
          <ul>
            <li>Parcels: Prince George's County GIS</li>
            <li>Buildings and streets: © OpenStreetMap contributors</li>
            <li>Zoning: PG County Code Sec. 27-4202, 27-5200</li>
            <li>State law: Maryland HB 1466 (2025)</li>
            <li>Rents: HUD FY2026 AMI and Fair Market Rents</li>
          </ul>
          <p>Feasibility estimates only, not permits, legal advice or appraisals. The 6 ft house gap, local size cap and construction costs are assumptions.</p>
        </details>
      </aside>

      {/* ---------- Map ---------- */}
      <main className="map" aria-label="3D map of College Park">
        <TownScene
          town={town}
          verdicts={verdicts}
          selected={selected}
          onSelect={(i) => { select(i); }}
          activeAgent={active}
          agentLine={lastLine.length > 160 ? lastLine.slice(0, 157) + '…' : lastLine}
          agentBusy={busy}
          square={CITY_HALL}
          flyKey={flyKey}
          dark={false}
          highlight={results?.all ?? null}
          place={results?.place ?? null}
        />
        <div className="map-tools">
          {results && (
            <span className="hits-chip"><span className="num">{results.total.toLocaleString()}</span> matches
              <button className="btn ghost icon" aria-label="Clear search results from the map" title="Clear" onClick={() => setResults(null)}><X size={12} /></button>
            </span>
          )}
          <button className="btn sm" onClick={() => select(null)} title="Show the whole city"><Maximize2 size={12} aria-hidden /> City view</button>
        </div>
        <div className="legend" aria-label="Map legend">
          {VERDICT_ORDER.map((v) => <span key={v}><i className="dot" style={{ background: VERDICT_COLORS[v] }} aria-hidden />{VERDICT_LABEL[v]}</span>)}
          <span><i className="dot" style={{ background: 'var(--unit)' }} aria-hidden />Proposed unit</span>
          {results && <span><i className="dot ring" aria-hidden />Search match</span>}
        </div>
      </main>

      <nav className="pane-switch" aria-label="Panels">
        <button className="tab" aria-selected={pane === 'city'} onClick={() => setPane('city')}>City and lot</button>
        <button className="tab" aria-selected={pane === 'agent'} onClick={() => setPane('agent')}>Agents</button>
      </nav>

      {/* ---------- Agent console ---------- */}
      <section className="console" aria-label="Agents">
        <div className="tabs" role="tablist" aria-label="Agents, one at a time">
          {ROLE_ORDER.map((id) => (
            <button key={id} className="tab" role="tab" id={`tab-${id}`} aria-selected={id === active} aria-controls="agent-panel" onClick={() => switchAgent(id)}>
              {ROLES[id].name}
            </button>
          ))}
        </div>

        <div id="agent-panel" role="tabpanel" aria-labelledby={`tab-${active}`} style={{ display: 'contents' }}>
          <div className="agent-head">
            <div className="agent-id">
              <div>
                <h2>{role.name}</h2>
                <p>{role.title}</p>
              </div>
              <span className={`agent-state ${agentState}`}>
                {agentState === 'busy' ? <><LoaderCircle size={12} className="spin" aria-hidden /> Working</> : agentState === 'waiting' ? <><i aria-hidden /> Needs a lot</> : <><i aria-hidden /> Ready</>}
              </span>
            </div>
            <p className="agent-desc">{role.description}</p>
            <div className="agent-tools" aria-label="Tools this agent can call">
              {role.tools.filter((t) => t !== 'hand_off').map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>

          {handoff && (
            <p className="handoff"><ArrowRightLeft size={13} aria-hidden />Context from the {ROLES[handoff.from].name} agent's last answer is included with your next message.</p>
          )}

          <div className="log" aria-live="polite">
            {thread.length === 0 && (
              <div className="intro">
                <p>Suggested questions</p>
                <div className="prompts">
                  {role.suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={busy}><CornerDownRight size={13} aria-hidden />{s}</button>
                  ))}
                </div>
                {blockedByLot && (
                  <p className="needs-lot"><Info size={13} aria-hidden />This agent answers about one lot. Select a lot on the map or search an address first.</p>
                )}
              </div>
            )}
            {thread.map((msg, i) => (
              <div key={i} className={`turn ${msg.role}${msg.error ? ' error' : ''}`}>
                <div className="turn-body">
                  <p className="turn-name">{msg.role === 'user' ? 'You' : role.name}</p>
                  <p className="turn-text">{msg.error && <AlertCircle size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 6 }} />}{msg.text}</p>
                  {msg.tools && msg.tools.length > 0 && (
                    <ul className="trace" aria-label="Tool calls">
                      {msg.tools.map((t, j) => (
                        <li key={j}>
                          <details>
                            <summary><span className="fn">{t.name}</span><span className="args">{argText(t.input)}</span>{t.pre && <span className="pre">pre-run</span>}</summary>
                            <pre>{JSON.stringify(t.input ?? {}, null, 2)}</pre>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                  {msg.actions?.filter((a): a is Results => a.type === 'results').map((a, j) => (
                    <div key={j} className="hits">
                      <div className="hits-head">
                        <span><strong className="num">{a.total.toLocaleString()}</strong> {a.total === 1 ? 'home' : 'homes'} {a.label}</span>
                        {results === a
                          ? <button className="btn ghost sm" onClick={() => setResults(null)}>Hide on map</button>
                          : <button className="btn ghost sm" onClick={() => setResults(a)}>Show on map</button>}
                      </div>
                      {a.homes.length > 0 && (
                        <ul>
                          {a.homes.slice(0, 8).map((h) => (
                            <li key={h.lotIndex}>
                              <a href={zillow(h.address, mailing[String(town.lots[h.lotIndex].id)])} target="_blank" rel="noopener noreferrer"
                                onClick={() => { select(h.lotIndex); setResults(a); }} aria-current={selected === h.lotIndex}
                                title={`Open ${h.address} on Zillow (new tab) and show it on the map`}>
                                <span className="hit-addr">{h.address}</span>
                                <span className="hit-num num">{k(h.assessedValue)}</span>
                                <span className="hit-num num muted">{h.driveMinutes != null ? `${h.driveMinutes} min` : ''}</span>
                                <ArrowUpRight size={13} className="hit-ext" aria-label="opens Zillow" />
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                      {a.total > 8 && <p className="hits-more">{a.total - 8} more highlighted on the map.</p>}
                    </div>
                  ))}
                  {msg.note && <p className="turn-note"><Info size={12} aria-hidden />{msg.note}</p>}
                  {msg.actions?.filter((a): a is Extract<AgentAction, { type: 'handoff' }> => a.type === 'handoff').map((a, j) => (
                    <button key={j} className="btn sm next" onClick={() => switchAgent(a.to)}>
                      Open {ROLES[a.to].name} agent: {a.reason} <ArrowRight size={12} aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {busy && <p className="working"><LoaderCircle size={13} className="spin" aria-hidden /> Running tools</p>}
            <div ref={logEnd} />
          </div>

          <div className="composer-wrap">
            {thread.length > 0 && unasked.length > 0 && (
              <div className="quick" aria-label="Suggested questions">
                {unasked.map((s) => <button key={s} className="btn sm" onClick={() => send(s)} disabled={busy}>{s}</button>)}
              </div>
            )}
            <form className="field composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
              <input ref={composerRef} aria-label={`Message the ${role.name} agent`} placeholder={`Ask the ${role.name} agent`} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} />
              <button type="button" className="btn ghost icon" onClick={listen} title="Dictate a question" aria-label="Dictate a question"><Mic size={15} /></button>
              <button type="button" className="btn ghost icon" aria-pressed={voice} onClick={() => { setVoice((v) => !v); window.speechSynthesis?.cancel(); }} title={voice ? 'Stop reading answers aloud' : 'Read answers aloud'} aria-label="Read answers aloud">
                {voice ? <Volume2 size={15} /> : <VolumeX size={15} />}
              </button>
              <button type="submit" className="btn primary icon" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp size={15} /></button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
