// Home search by price and distance from a named place. All figures are computed here, never by a model.
// - Prices: each lot's current county assessed value (public/data/values.json, PG County via SDAT).
// - Places: named schools, stations, parks, libraries, shops from OpenStreetMap (public/data/places.json).
// - Drive time: shortest path over College Park's OpenStreetMap street network at typical speeds per road class,
//   plus a straight-line leg (x1.3 detour at 25 mph) to reach the network from places outside it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluate } from '../engine/rules.ts';
import { town } from './tools.ts';

export type Place = { name: string; kind: string; x: number; y: number; addr?: string };

const load = <T,>(f: string, fallback: T): T => {
  try { return JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', f), 'utf8')) as T; } catch { return fallback; }
};
let valuesCache: Record<string, number> | null = null;
let placesCache: Place[] | null = null;
export const values = () => (valuesCache ??= load<Record<string, number>>('values.json', {}));
export const places = () => (placesCache ??= load<Place[]>('places.json', []));

/** Assessed value for a lot, or null when the county record is missing or nominal (e.g. exempt parcels at $100). */
export function assessed(lotIndex: number): number | null {
  const l = town().lots[lotIndex];
  const v = l ? values()[String(l.id)] : undefined;
  return v && v >= 20000 ? v : null;
}

/* ---------- place lookup ---------- */

const words = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const STOP = new Set(['the', 'of', 'at', 'a', 'an', 'and', 'in', 'md']);
// Words that name a kind of place rather than part of its name.
const KIND_WORDS: Record<string, string[]> = {
  university: ['university'], campus: ['university'], metro: ['station'], station: ['station'], train: ['station'], marc: ['station'],
  school: ['school', 'kindergarten', 'college', 'university'], library: ['library'], hospital: ['hospital', 'clinic'],
  park: ['park'], church: ['place_of_worship'], grocery: ['supermarket'], supermarket: ['supermarket'], mall: ['mall'],
};

export function findPlace(query: string): { best: Place | null; alternatives: Place[] } {
  const all = words(query).flatMap((w) => (w === 'umd' || w === 'uofm' ? ['university', 'maryland', 'college', 'park'] : [w])).filter((w) => !STOP.has(w));
  const kinds = new Set(all.flatMap((w) => KIND_WORDS[w] ?? []));
  // Kind words like "metro" match the kind, not the name.
  const q = all.filter((w) => !(w in KIND_WORDS) || ['school', 'park', 'library', 'university'].includes(w));
  if (!q.length) return { best: null, alternatives: [] };
  const scored = places().map((p) => {
    const n = words(p.name);
    const nset = new Set(n);
    const hits = q.filter((w) => nset.has(w)).length;
    if (!hits) return { p, s: 0 };
    const recall = hits / q.length, precision = hits / n.filter((w) => !STOP.has(w)).length;
    const exact = p.name.toLowerCase() === query.toLowerCase().trim() ? 1 : 0;
    return { p, s: recall * 2 + precision + exact * 3 + (kinds.has(p.kind) ? 0.75 : 0) };
  }).filter((r) => r.s >= 1.6).sort((a, b) => b.s - a.s);
  return { best: scored[0]?.p ?? null, alternatives: scored.slice(1, 4).map((r) => r.p) };
}

/* ---------- street network ---------- */

const MPH: Record<string, number> = {
  motorway: 55, trunk: 45, primary: 35, primary_link: 25, secondary: 30, secondary_link: 25, tertiary: 28, tertiary_link: 20,
  residential: 22, unclassified: 22, living_street: 12, service: 10,
};
const FT_PER_MIN_PER_MPH = 5280 / 60;

type Graph = { xs: Float64Array; ys: Float64Array; adj: { to: number; min: number }[][]; grid: Map<string, number[]> };
let graphCache: Graph | null = null;
const CELL = 400;

function graph(): Graph {
  if (graphCache) return graphCache;
  const T = town();
  const id = new Map<string, number>();
  const xs: number[] = [], ys: number[] = [], adj: { to: number; min: number }[][] = [];
  const node = (x: number, y: number) => {
    const k = Math.round(x) + ',' + Math.round(y);
    let n = id.get(k);
    if (n == null) { n = xs.length; id.set(k, n); xs.push(x); ys.push(y); adj.push([]); }
    return n;
  };
  for (const r of T.roads) {
    const speed = (MPH[r.k] ?? 20) * FT_PER_MIN_PER_MPH;
    for (let i = 0; i + 3 < r.g.length; i += 2) {
      const a = node(r.g[i], r.g[i + 1]), b = node(r.g[i + 2], r.g[i + 3]);
      if (a === b) continue;
      const min = Math.hypot(r.g[i + 2] - r.g[i], r.g[i + 3] - r.g[i + 1]) / speed;
      adj[a].push({ to: b, min }); adj[b].push({ to: a, min });
    }
  }
  const grid = new Map<string, number[]>();
  xs.forEach((x, n) => { const k = Math.floor(x / CELL) + ',' + Math.floor(ys[n] / CELL); (grid.get(k) ?? grid.set(k, []).get(k)!).push(n); });
  graphCache = { xs: Float64Array.from(xs), ys: Float64Array.from(ys), adj, grid };
  return graphCache;
}

/** Nearest network node to a point, searching outward ring by ring. */
function snap(x: number, y: number): { n: number; d: number } {
  const G = graph();
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let best = { n: -1, d: Infinity };
  for (let r = 0; r < 200; r++) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      for (const n of G.grid.get(cx + i + ',' + (cy + j)) ?? []) {
        const d = Math.hypot(G.xs[n] - x, G.ys[n] - y);
        if (d < best.d) best = { n, d };
      }
    }
    if (best.n >= 0 && best.d < r * CELL) break;
  }
  return best;
}

const OFFNET_MIN_PER_FT = 1.3 / (25 * FT_PER_MIN_PER_MPH);
const PARK_MIN = 1; // pulling out and parking

function minutesFrom(x: number, y: number): Float64Array {
  const G = graph();
  const n0 = G.xs.length;
  const dist = new Float64Array(n0).fill(Infinity);
  const s = snap(x, y);
  if (s.n < 0) return dist;
  dist[s.n] = s.d * OFFNET_MIN_PER_FT;
  // Binary-heap Dijkstra.
  const heap: [number, number][] = [[dist[s.n], s.n]];
  const push = (e: [number, number]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const { to, min } of G.adj[u]) { const nd = d + min; if (nd < dist[to]) { dist[to] = nd; push([nd, to]); } }
  }
  return dist;
}

/* ---------- search ---------- */

export type SearchInput = {
  near?: string; maxPrice?: number; minPrice?: number; maxMiles?: number; maxDriveMinutes?: number;
  canAddUnit?: boolean; minBedroomsProxySqft?: number; limit?: number;
};

export function searchHomes(input: SearchInput) {
  const T = town();
  const limit = Math.max(1, Math.min(25, Math.round(input.limit ?? 10)));
  let place: Place | null = null;
  let alternatives: Place[] = [];
  if (input.near && input.near.trim()) {
    const f = findPlace(input.near);
    place = f.best; alternatives = f.alternatives;
    if (!place) return { error: `No named place matching "${input.near}" in the OpenStreetMap places list within about 6 miles of College Park. Ask the user for an address or a nearby landmark.`, homes: [] };
  }
  const mins = place ? minutesFrom(place.x, place.y) : null;
  const lotNode = place ? T.lots.map((l) => snap(l.pos[0], l.pos[1])) : null;
  const rows: { lotIndex: number; address: string; assessedValue: number; miles: number | null; driveMinutes: number | null; canAddUnit: boolean; livingSqft: number; yearBuilt: number | null; lotSqft: number }[] = [];
  T.lots.forEach((l, i) => {
    const v = assessed(i);
    if (v == null || !l.addr || !(l.livingSqft > 0)) return; // only houses with a county record of living area
    if (input.maxPrice != null && v > input.maxPrice) return;
    if (input.minPrice != null && v < input.minPrice) return;
    if (input.minBedroomsProxySqft != null && (l.livingSqft || 0) < input.minBedroomsProxySqft) return;
    let miles: number | null = null, drive: number | null = null;
    if (place && mins && lotNode) {
      miles = Math.hypot(l.pos[0] - place.x, l.pos[1] - place.y) / 5280;
      const s = lotNode[i];
      drive = mins[s.n] + s.d * OFFNET_MIN_PER_FT + PARK_MIN;
      if (!Number.isFinite(drive)) drive = null;
      if (input.maxMiles != null && miles > input.maxMiles) return;
      if (input.maxDriveMinutes != null && (drive == null || drive > input.maxDriveMinutes)) return;
    }
    const canAdd = evaluate(l).verdict === 'yes';
    if (input.canAddUnit && !canAdd) return;
    rows.push({
      lotIndex: i, address: l.addr || '(no street address)', assessedValue: v,
      miles: miles == null ? null : Math.round(miles * 10) / 10, driveMinutes: drive == null ? null : Math.round(drive),
      canAddUnit: canAdd, livingSqft: l.livingSqft, yearBuilt: l.year ?? null, lotSqft: l.lotSqft,
    });
  });
  // Closest first when a place is given (then cheaper); otherwise cheapest first.
  rows.sort((a, b) => (place ? (a.driveMinutes ?? 1e9) - (b.driveMinutes ?? 1e9) || a.assessedValue - b.assessedValue : a.assessedValue - b.assessedValue));
  const prices = rows.map((r) => r.assessedValue).sort((a, b) => a - b);
  return {
    place: place ? { name: place.name, kind: place.kind, address: place.addr ?? null, otherMatches: alternatives.map((p) => p.name) } : null,
    filters: input,
    matchingHomes: rows.length,
    priceRange: prices.length ? { min: prices[0], median: prices[Math.floor(prices.length / 2)], max: prices[prices.length - 1] } : null,
    homes: rows.slice(0, limit),
    _all: rows.map((r) => r.lotIndex),
    method: 'Price = current Prince George\'s County assessed value (public SDAT record), not a listing or asking price. ' +
      'Drive time = shortest route on OpenStreetMap streets at typical speeds (22 mph residential to 35 mph arterials), plus 1 minute to park; no traffic. ' +
      'Covers single-family homes inside College Park only; none of these homes are known to be for sale.',
    _place: place,
  };
}
