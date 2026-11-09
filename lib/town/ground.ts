// Ground-level city surfaces: land-use fills for parcels that are not single-family lots, asphalt roads
// with lane markings, and tree placements (street trees, yard trees, parks). Local feet; scene Z = -y.
import * as THREE from 'three';
import type { TownData } from './types.ts';

export type GroundTheme = 'day' | 'night';

export const GROUND = {
  // Google-Maps-style light map: pale grey land, green parks, white streets with grey casings, yellow arterials.
  day: {
    base: '#e3e8dd', // right of way between parcels
    lawn: '#e6eedd',
    park: '#c3e6cb',
    meadow: '#e3efdc',
    campus: '#e6eee1',
    paved: '#e7eae4',
    utility: '#e2e5de',
    road: { major: '#9aa0a6', minor: '#b4b8bd', service: '#c6c9cd' },
    casing: { major: '#80868b', minor: '#9ea3a8', service: '#b3b7bb' },
    marking: '#ffffff',
    centre: '#ffffff',
    canopy: ['#a8d5a2', '#9ccc96', '#b2dbab', '#93c38d', '#bce0b5'],
    trunk: '#b7a99a',
  },
  night: {
    base: '#2c2e33',
    lawn: '#1d241c',
    park: '#1a2618',
    meadow: '#22271d',
    campus: '#1e261c',
    paved: '#2a2c30',
    utility: '#2b2b2e',
    road: { major: '#181a1e', minor: '#1b1d21', service: '#212328' },
    casing: { major: '#3a3d43', minor: '#34373c', service: '#303237' },
    marking: '#6b6d70',
    centre: '#7a6a3a',
    canopy: ['#2f3d27', '#2a3824', '#34432b', '#263321', '#38462e'],
    trunk: '#3a3029',
  },
} as const;

type Pal = typeof GROUND.day;

const USE_FILL: Record<string, keyof Pal> = {
  SFD: 'lawn', SFA: 'lawn', TH: 'lawn', MF: 'lawn', UNK: 'lawn',
  'P-O': 'park', VAC: 'meadow', INS: 'campus', CHU: 'campus',
  COM: 'paved', OFF: 'paved', MIX: 'paved', NC: 'paved', IND: 'utility', 'T-U': 'utility',
};

const ROAD: Record<string, { w: number; tier: 'major' | 'minor' | 'service'; centre?: 'solid' | 'dash' }> = {
  motorway: { w: 60, tier: 'major', centre: 'solid' }, trunk: { w: 50, tier: 'major', centre: 'solid' },
  primary: { w: 44, tier: 'major', centre: 'solid' }, primary_link: { w: 24, tier: 'major' },
  secondary: { w: 38, tier: 'major', centre: 'dash' }, secondary_link: { w: 22, tier: 'major' },
  tertiary: { w: 32, tier: 'minor', centre: 'dash' }, tertiary_link: { w: 20, tier: 'minor' },
  residential: { w: 26, tier: 'minor' }, unclassified: { w: 24, tier: 'minor' }, living_street: { w: 20, tier: 'minor' },
  service: { w: 12, tier: 'service' },
};
const roadOf = (k: string) => ROAD[k] ?? { w: 20, tier: 'minor' as const };

function pts(g: number[]) {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < g.length; i += 2) out.push(new THREE.Vector2(g[i], g[i + 1]));
  if (out.length > 2 && out[0].equals(out[out.length - 1])) out.pop();
  if (out.length > 2 && THREE.ShapeUtils.isClockWise(out)) out.reverse();
  return out;
}

function geo(pos: number[], col: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Land-use fill for every parcel that is not a scanned single-family lot. */
export function parcelFills(town: TownData, theme: GroundTheme, y = 0.15) {
  const P = GROUND[theme];
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const p of town.parcels) {
    if (p.lot >= 0) continue;
    const v = pts(p.poly);
    if (v.length < 3) continue;
    c.set(P[USE_FILL[p.use] ?? 'lawn'] as string);
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(v, [])) {
      for (const q of [v[i], v[j], v[k]]) { pos.push(q.x, y, -q.y); col.push(c.r, c.g, c.b); }
    }
  }
  return geo(pos, col);
}

/** Asphalt ribbons (with round-ish joins) and lane markings. */
export function roadSurfaces(town: TownData, theme: GroundTheme) {
  const P = GROUND[theme];
  const pos: number[] = [], col: number[] = [];
  const mpos: number[] = [], mcol: number[] = [];
  const c = new THREE.Color(), m = new THREE.Color(), yc = new THREE.Color(P.centre), wc = new THREE.Color(P.marking);
  // Draw service roads first, majors last, each tier slightly higher so majors win at junctions.
  const order = { service: 0, minor: 1, major: 2 } as const;
  const roads = [...town.roads].sort((a, b) => order[roadOf(a.k).tier] - order[roadOf(b.k).tier]);
  const strip = (out: number[], cols: number[], color: THREE.Color, ax: number, ay: number, bx: number, by: number, hw: number, y: number) => {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (-(by - ay) / len) * hw, ny = ((bx - ax) / len) * hw;
    const q = [ax + nx, y, -(ay + ny), ax - nx, y, -(ay - ny), bx - nx, y, -(by - ny), ax + nx, y, -(ay + ny), bx - nx, y, -(by - ny), bx + nx, y, -(by + ny)];
    out.push(...q);
    for (let i = 0; i < 6; i++) cols.push(color.r, color.g, color.b);
  };
  const disc = (out: number[], cols: number[], color: THREE.Color, x: number, yy: number, r: number, y: number) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      out.push(x, y, -yy, x + Math.cos(a0) * r, y, -(yy + Math.sin(a0) * r), x + Math.cos(a1) * r, y, -(yy + Math.sin(a1) * r));
      for (let k = 0; k < 3; k++) cols.push(color.r, color.g, color.b);
    }
  };
  // Pass 1: casings (a slightly wider grey edge), all tiers. Pass 2: road fills on top. One mesh, painted in order.
  for (const pass of ['casing', 'fill'] as const) {
    for (const r of roads) {
      const spec = roadOf(r.k);
      const hw = spec.w / 2 + (pass === 'casing' ? (spec.tier === 'service' ? 1.5 : 3) : 0);
      const y = 0.3;
      c.set(pass === 'casing' ? P.casing[spec.tier] : P.road[spec.tier]);
      const g = r.g;
      for (let i = 0; i + 3 < g.length; i += 2) strip(pos, col, c, g[i], g[i + 1], g[i + 2], g[i + 3], hw, y);
      for (let i = 0; i + 1 < g.length; i += 2) disc(pos, col, c, g[i], g[i + 1], hw, y);
    }
  }
  // Lane lines only on the night map; Google-style day streets are plain.
  if (theme === 'night') for (const r of roads) {
    const spec = roadOf(r.k);
    if (!spec.centre) continue;
    const g = r.g;
    m.copy(spec.centre === 'solid' ? yc : wc);
    const my = 0.42;
    for (let i = 0; i + 3 < g.length; i += 2) {
      const ax = g[i], ay = g[i + 1], bx = g[i + 2], by = g[i + 3];
      const len = Math.hypot(bx - ax, by - ay);
      if (spec.centre === 'solid') { strip(mpos, mcol, m, ax, ay, bx, by, 0.6, my); continue; }
      for (let t = 2; t + 10 < len; t += 30) {
        const f0 = t / len, f1 = (t + 10) / len;
        strip(mpos, mcol, m, ax + (bx - ax) * f0, ay + (by - ay) * f0, ax + (bx - ax) * f1, ay + (by - ay) * f1, 0.45, my);
      }
    }
  }
  return { asphalt: geo(pos, col), markings: geo(mpos, mcol) };
}

/* ---------- trees ---------- */

function rand(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function inPoly(g: number[], x: number, y: number) {
  let c = false;
  const n = g.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = g[i * 2], yi = g[i * 2 + 1], xj = g[j * 2], yj = g[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export type Tree = { x: number; y: number; s: number; tone: number };

/** Street, yard and park trees, kept off buildings, roads and proposed units. */
export function treeSpots(town: TownData): Tree[] {
  const CELL = 120;
  const grid = new Map<string, number[][]>();
  const put = (g: number[], pad: number) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); }
    const box = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    for (let cx = Math.floor(box[0] / CELL); cx <= Math.floor(box[2] / CELL); cx++)
      for (let cy = Math.floor(box[1] / CELL); cy <= Math.floor(box[3] / CELL); cy++) {
        const k = cx + ',' + cy;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push([...box, ...g] as number[]);
      }
  };
  for (const b of town.buildings) put(b.g, 7);
  for (const l of town.lots) if (l.cottage) put(l.cottage, 8);
  const blocked = (x: number, y: number) => {
    for (const e of grid.get(Math.floor(x / CELL) + ',' + Math.floor(y / CELL)) ?? []) {
      if (x < e[0] || x > e[2] || y < e[1] || y > e[3]) continue;
      // Inside the padded box counts as blocked when it is near or inside the footprint.
      const g = e.slice(4);
      if (inPoly(g, x, y)) return true;
      let dmin = Infinity;
      for (let i = 0; i < g.length; i += 2) dmin = Math.min(dmin, Math.hypot(g[i] - x, g[i + 1] - y));
      if (dmin < 9) return true;
    }
    return false;
  };
  // Road corridors, so yard trees never sit on asphalt.
  const roadGrid = new Map<string, number[][]>();
  for (const r of town.roads) {
    const hw = roadOf(r.k).w / 2;
    for (let i = 0; i + 3 < r.g.length; i += 2) {
      const s = [r.g[i], r.g[i + 1], r.g[i + 2], r.g[i + 3], hw];
      const x0 = Math.min(s[0], s[2]) - hw, x1 = Math.max(s[0], s[2]) + hw, y0 = Math.min(s[1], s[3]) - hw, y1 = Math.max(s[1], s[3]) + hw;
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
        for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
          const k = cx + ',' + cy;
          (roadGrid.get(k) ?? roadGrid.set(k, []).get(k)!).push(s);
        }
    }
  }
  const onRoad = (x: number, y: number, extra: number) => {
    for (const [ax, ay, bx, by, hw] of roadGrid.get(Math.floor(x / CELL) + ',' + Math.floor(y / CELL)) ?? []) {
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
      if (Math.hypot(ax + dx * t - x, ay + dy * t - y) < hw + extra) return true;
    }
    return false;
  };

  const out: Tree[] = [];
  const r = rand(7);
  const tree = (x: number, y: number, s: number) => out.push({ x, y, s, tone: r() });

  // Street trees along residential and tertiary streets.
  for (const rd of town.roads) {
    if (!['residential', 'tertiary', 'unclassified', 'living_street'].includes(rd.k)) continue;
    const hw = roadOf(rd.k).w / 2;
    const g = rd.g;
    for (let i = 0; i + 3 < g.length; i += 2) {
      const ax = g[i], ay = g[i + 1], bx = g[i + 2], by = g[i + 3];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 20) continue;
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let t = 18 + r() * 20; t < len - 10; t += 38 + r() * 26) {
        for (const side of [1, -1]) {
          if (r() < 0.35) continue;
          const off = hw + 5 + r() * 3;
          const x = ax + ((bx - ax) * t) / len + nx * off * side, y = ay + ((by - ay) * t) / len + ny * off * side;
          if (!blocked(x, y) && !onRoad(x, y, 3)) tree(x, y, 0.8 + r() * 0.5);
        }
      }
    }
  }
  // Yard and park trees.
  for (const p of town.parcels) {
    const kind = USE_FILL[p.use] ?? 'lawn';
    if (kind === 'paved' || kind === 'utility') continue;
    const g = p.poly;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < g.length; i += 2) { x0 = Math.min(x0, g[i]); x1 = Math.max(x1, g[i]); y0 = Math.min(y0, g[i + 1]); y1 = Math.max(y1, g[i + 1]); }
    const a = (x1 - x0) * (y1 - y0);
    const per = kind === 'park' ? 1400 : kind === 'campus' ? 4500 : kind === 'meadow' ? 3500 : 3200;
    const want = Math.min(kind === 'park' ? 120 : 6, Math.round(a / per));
    let placed = 0;
    for (let tries = 0; placed < want && tries < want * 6; tries++) {
      const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
      if (!inPoly(g, x, y) || blocked(x, y) || onRoad(x, y, 6)) continue;
      tree(x, y, 0.75 + r() * 0.7);
      placed++;
    }
  }
  return out;
}
