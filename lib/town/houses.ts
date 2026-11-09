// Procedural building models on the real footprints. Everything is merged into two geometries:
// `body` (lit: walls, roofs, chimneys, porches) and `glass` (unlit: windows and doors), each with a
// per-triangle owner array for picking. Data is in local feet (x east, y north); scene X = x, Y = up, Z = -y.
//
// Houses: near-rectangular footprints get an oriented box body with a gable or hip roof, eaves,
// a chimney, windows per storey, a front door and sometimes a porch. Irregular footprints keep
// their real outline and get a hipped (pyramid) roof when the shape allows, else a flat roof.
// Other buildings: real outline, window bands, parapet and rooftop units.
import * as THREE from 'three';

export type Theme = 'day' | 'night';
export type Built = { geometry: THREE.BufferGeometry; triOwner: Int32Array };
export type CityMeshes = { body: Built; glass: Built };

type V2 = [number, number];
type Spec = { g: number[]; h: number; owner: number; kind: 'house' | 'other' | 'cottage'; seed: number };

const PALETTE = {
  day: {
    walls: ['#f4f2ed', '#ebe7df', '#e3ded4', '#dde1e4', '#e8e1d6', '#d9d4ca', '#c9b8a6', '#b79a86'],
    roofs: ['#5a5e65', '#6a625b', '#4d535a', '#78716a', '#5d676c', '#433f3c'],
    // Muted facades: campus red brick, sandstone, slate, sage, cream, terracotta, concrete.
    other: ['#b5644f', '#a9584a', '#c27a5f', '#d8c6a5', '#cdb892', '#8fa1b3', '#a3b5a0', '#e6dcc8', '#c98b6b', '#cfd2d6'],
    otherRoof: ['#7d828a', '#6f747c', '#8a8c8f', '#5f646b'],
    trim: '#fbfaf7',
    chimney: '#8a6f62',
    porch: '#cfc8bd',
    glass: ['#5b6675', '#56606e', '#636d7a'],
    lit: '#5b6675',
    door: ['#3f4650', '#5a3d32', '#2f4a5a', '#4b4f3f'],
    unitWall: '#dbe4fb',
    unitRoof: '#2d5bd8',
  },
  night: {
    walls: ['#8d8f96', '#868890', '#7f8189', '#888a91', '#83827f', '#7a7b80', '#7b716a', '#735f55'],
    roofs: ['#3a3d43', '#423e3a', '#34383e', '#4a4642', '#3a4145', '#2e2c2a'],
    other: ['#6e4237', '#663b33', '#74503f', '#7d7260', '#776b56', '#56626e', '#5f6b5d', '#837b6e', '#77574a', '#5f6268'],
    otherRoof: ['#34373c', '#2f3237', '#3a3c3f', '#2a2d31'],
    trim: '#9a9ca2',
    chimney: '#5d4c44',
    porch: '#6c6a66',
    glass: ['#262a32', '#22262d', '#2a2e36'],
    lit: '#d9b878',
    door: ['#24282e', '#3a2a24', '#22313b', '#30332a'],
    unitWall: '#6b4a33',
    unitRoof: '#6e8ff0',
  },
} as const;

/* ---------- small helpers ---------- */

function rand(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length) % xs.length];

function ring(g: number[]): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < g.length; i += 2) out.push([g[i], g[i + 1]]);
  if (out.length > 2 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  // Counter-clockwise in plan.
  if (area(out) < 0) out.reverse();
  return out;
}
function area(p: V2[]) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
function centroid(p: V2[]): V2 {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-6) return p[0];
  return [cx / (3 * a), cy / (3 * a)];
}
function inside(p: V2[], [x, y]: V2) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function hull(pts: V2[]): V2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: V2, a: V2, b: V2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: V2[] = [], up: V2[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Minimum-area oriented rectangle; u is the long axis. */
function obb(pts: V2[]) {
  const h = hull(pts);
  let best = { a: Infinity, c: [0, 0] as V2, u: [1, 0] as V2, L: 0, W: 0 };
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i], [x2, y2] = h[(i + 1) % h.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1e-6) continue;
    const u: V2 = [(x2 - x1) / len, (y2 - y1) / len], w: V2 = [-u[1], u[0]];
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, y] of h) { const a = x * u[0] + y * u[1], b = x * w[0] + y * w[1]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const ar = (a1 - a0) * (b1 - b0);
    if (ar < best.a) {
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
      best = { a: ar, c: [ca * u[0] + cb * w[0], ca * u[1] + cb * w[1]], u, L: (a1 - a0) / 2, W: (b1 - b0) / 2 };
    }
  }
  if (best.W > best.L) best = { ...best, u: [-best.u[1], best.u[0]], L: best.W, W: best.L };
  return best;
}

/* ---------- geometry sink ---------- */

class Sink {
  pos: number[] = []; col: number[] = []; own: number[] = [];
  owner = -1;
  color = new THREE.Color();
  set(hex: string | THREE.Color) { if (typeof hex === 'string') this.color.set(hex); else this.color.copy(hex); return this; }
  tri(a: number[], b: number[], c: number[]) {
    // Points are [x, y(plan north), z(up)].
    for (const p of [a, b, c]) { this.pos.push(p[0], p[2], -p[1]); this.col.push(this.color.r, this.color.g, this.color.b); }
    this.own.push(this.owner);
  }
  quad(a: number[], b: number[], c: number[], d: number[]) { this.tri(a, b, c); this.tri(a, c, d); }
  /** Vertical rectangle on the segment p→q from z0 to z1. */
  wall(p: V2, q: V2, z0: number, z1: number) { this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]); }
  /** Oriented box: centre c, axes u/w (unit), half sizes a/b, from z0 to z1 (top + 4 sides). */
  box(c: V2, u: V2, a: number, b: number, z0: number, z1: number) {
    const w: V2 = [-u[1], u[0]];
    const k = (sa: number, sb: number): V2 => [c[0] + u[0] * a * sa + w[0] * b * sb, c[1] + u[1] * a * sa + w[1] * b * sb];
    const cs = [k(1, 1), k(-1, 1), k(-1, -1), k(1, -1)];
    for (let i = 0; i < 4; i++) this.wall(cs[i], cs[(i + 1) % 4], z0, z1);
    this.quad([...cs[0], z1], [...cs[1], z1], [...cs[2], z1], [...cs[3], z1]);
  }
  build(): Built {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, triOwner: Int32Array.from(this.own) };
  }
}

const add = (p: V2, v: V2, s: number): V2 => [p[0] + v[0] * s, p[1] + v[1] * s];

/** Windows (and an optional door) along one wall, pushed slightly off the face along `n`. */
function openings(glass: Sink, P: typeof PALETTE.day, r: () => number, p: V2, q: V2, n: V2, stories: number, storyH: number, door: boolean, night: boolean, opts: { w?: number; h?: number; band?: boolean } = {}) {
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  if (len < 7) return;
  const d: V2 = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
  const off = 0.25;
  const at = (t: number, z: number): number[] => { const s = add(add(p, d, t), n, off); return [s[0], s[1], z]; };
  const pane = (t0: number, t1: number, z0: number, z1: number, hex: string) => { glass.set(hex); glass.quad(at(t0, z0), at(t1, z0), at(t1, z1), at(t0, z1)); };
  if (opts.band) {
    for (let s = 0; s < stories; s++) {
      const z0 = s * storyH + storyH * 0.32, z1 = z0 + storyH * 0.42;
      pane(1.5, len - 1.5, z0, z1, night && r() < 0.35 ? P.lit : pick(r, P.glass));
    }
    return;
  }
  const ww = opts.w ?? 3.2, wh = opts.h ?? 4.4, gap = 10.5;
  const n0 = Math.max(1, Math.floor((len - 3) / gap));
  const step = len / (n0 + 1);
  const doorAt = door ? Math.max(1, Math.round((n0 + 1) / 2)) : -1;
  for (let s = 0; s < stories; s++) {
    for (let i = 1; i <= n0; i++) {
      const t = step * i;
      if (s === 0 && i === doorAt) {
        pane(t - 1.8, t + 1.8, 0.4, 7.2, pick(r, P.door));
        continue;
      }
      const z0 = s * storyH + 3.2;
      pane(t - ww / 2, t + ww / 2, z0, z0 + wh, night && r() < 0.3 ? P.lit : pick(r, P.glass));
    }
  }
}

/* ---------- house types ---------- */

function boxHouse(body: Sink, glass: Sink, P: typeof PALETTE.day, r: () => number, s: Spec, night: boolean, o: ReturnType<typeof obb>) {
  const { c, u, L, W } = o;
  const w: V2 = [-u[1], u[0]];
  const cottage = s.kind === 'cottage';
  const base = cottage ? 0.8 : 0;
  const stories = cottage ? 1 : s.h >= 23 && W > 9 ? 2 : 1;
  const storyH = cottage ? 9 : 9.5;
  const eave = base + stories * storyH;
  const pitch = cottage ? 0.42 : 0.38 + r() * 0.22;
  const rise = Math.max(3.5, Math.min(W * pitch, 15));
  const ov = cottage ? 0.9 : 1.6;
  const wall = cottage ? P.unitWall : pick(r, P.walls);
  const roof = cottage ? P.unitRoof : pick(r, P.roofs);
  const hip = !cottage && (r() < 0.38 || L < W * 1.15);

  const k = (sa: number, sb: number, a = L, b = W): V2 => [c[0] + u[0] * a * sa + w[0] * b * sb, c[1] + u[1] * a * sa + w[1] * b * sb];
  const corners = [k(1, 1), k(-1, 1), k(-1, -1), k(1, -1)];

  // Walls (+ foundation line).
  body.set(P.porch);
  for (let i = 0; i < 4; i++) body.wall(corners[i], corners[(i + 1) % 4], base, base + 1.2);
  body.set(wall);
  for (let i = 0; i < 4; i++) body.wall(corners[i], corners[(i + 1) % 4], base + 1.2, eave);

  // Roof.
  const ez = eave - ov * pitch; // eave drops a little with the overhang
  const rz = eave + rise;
  const E = (sa: number, sb: number): number[] => [...k(sa, sb, L + ov, W + ov), ez];
  body.set(roof);
  if (!hip) {
    const R1 = [...k(1, 0, L + ov, 0), rz], R2 = [...k(-1, 0, L + ov, 0), rz];
    body.quad(E(1, 1), E(-1, 1), R2, R1);
    body.quad(E(-1, -1), E(1, -1), R1, R2);
    // Gable ends in wall colour, trim line along the rake.
    body.set(wall);
    for (const sa of [1, -1]) body.tri([...k(sa, 1), eave], [...k(sa, -1), eave], [...k(sa, 0, L, 0), rz - ov * pitch * 0.2]);
  } else {
    const rl = Math.max(0, L - W);
    const R1 = [...k(1, 0, rl, 0), rz], R2 = [...k(-1, 0, rl, 0), rz];
    body.quad(E(1, 1), E(-1, 1), R2, R1);
    body.quad(E(-1, -1), E(1, -1), R1, R2);
    body.tri(E(1, -1), E(1, 1), R1);
    body.tri(E(-1, 1), E(-1, -1), R2);
  }
  // Fascia: a thin trim band under the eave.
  body.set(P.trim);
  const ec = [k(1, 1, L + ov, W + ov), k(-1, 1, L + ov, W + ov), k(-1, -1, L + ov, W + ov), k(1, -1, L + ov, W + ov)];
  for (let i = 0; i < 4; i++) body.wall(ec[i], ec[(i + 1) % 4], ez - 0.7, ez);

  // Chimney.
  if (!cottage && r() < 0.55 && L > 12) {
    const sa = r() < 0.5 ? 1 : -1;
    const cc = k(sa * 0.62, r() < 0.5 ? 0.35 : -0.35);
    body.set(P.chimney).box(cc, u, 1.4, 1.4, eave, rz + 2.5);
  }

  // Openings: front door on one long side, windows on all sides.
  const front = r() < 0.5 ? 1 : -1;
  const sides: [V2, V2, V2, boolean][] = [
    [corners[0], corners[1], w, front === 1],
    [corners[2], corners[3], [-w[0], -w[1]], front === -1],
    [corners[1], corners[2], [-u[0], -u[1]], false],
    [corners[3], corners[0], u, false],
  ];
  for (const [p, q, n, door] of sides) {
    const pb: V2 = p, qb: V2 = q;
    if (cottage) {
      openings(glass, P, r, pb, qb, n, 1, storyH, door, night, { w: 2.6, h: 3.6 });
    } else {
      // Openings are generated relative to the ground; lift to base by offsetting z inside.
      openings(glass, P, r, pb, qb, n, stories, storyH, door, night);
    }
  }

  // Porch: deck, two posts and a shallow roof in front of the door.
  if (!cottage && r() < 0.42 && L > 14) {
    const nf: V2 = front === 1 ? w : [-w[0], -w[1]];
    const depth = 5.5, half = Math.min(L * 0.45, 9);
    const pc = add(c, nf, W + depth / 2);
    body.set(P.porch).box(pc, u, half, depth / 2, 0, 1.1);
    body.set(P.trim);
    for (const sa of [1, -1]) body.box(add(add(pc, u, sa * (half - 0.6)), nf, depth / 2 - 0.6), u, 0.35, 0.35, 1.1, 8.6);
    body.set(roof).box(pc, u, half + 0.4, depth / 2 + 0.4, 8.6, 9.3);
  }
}

function freeformHouse(body: Sink, glass: Sink, P: typeof PALETTE.day, r: () => number, s: Spec, night: boolean, pts: V2[]) {
  const stories = s.h >= 23 ? 2 : 1;
  const storyH = 9.5, eave = stories * storyH;
  const wall = pick(r, P.walls), roof = pick(r, P.roofs);
  body.set(P.porch);
  for (let i = 0; i < pts.length; i++) body.wall(pts[i], pts[(i + 1) % pts.length], 0, 1.2);
  body.set(wall);
  for (let i = 0; i < pts.length; i++) body.wall(pts[i], pts[(i + 1) % pts.length], 1.2, eave);
  // Hipped roof to a kernel point if every edge can see it, else flat.
  const k = centroid(pts);
  const star = pts.every((p, i) => { const q = pts[(i + 1) % pts.length]; return (q[0] - p[0]) * (k[1] - p[1]) - (q[1] - p[1]) * (k[0] - p[0]) > 0.5; });
  const span = Math.sqrt(Math.abs(area(pts)));
  body.set(roof);
  if (star) {
    const apex = [k[0], k[1], eave + Math.max(4, Math.min(span * 0.22, 12))];
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; body.tri([p[0], p[1], eave], [q[0], q[1], eave], apex); }
  } else {
    for (const [i, j, l] of THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), [])) {
      body.tri([...pts[i], eave + 1], [...pts[j], eave + 1], [...pts[l], eave + 1]);
    }
    body.set(P.trim);
    for (let i = 0; i < pts.length; i++) body.wall(pts[i], pts[(i + 1) % pts.length], eave, eave + 1);
  }
  let doorDone = false;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n: V2 = [(q[1] - p[1]) / len, -(q[0] - p[0]) / len];
    const door = !doorDone && len > 14;
    if (door) doorDone = true;
    openings(glass, P, r, p, q, n, stories, storyH, door, night);
  }
}

function otherBuilding(body: Sink, glass: Sink, P: typeof PALETTE.day, r: () => number, s: Spec, night: boolean, pts: V2[]) {
  const h = Math.max(10, Math.min(s.h, 260));
  const storyH = 12, stories = Math.max(1, Math.round(h / storyH));
  const facade = pick(r, P.other), top = pick(r, P.otherRoof);
  const plinth = Math.min(3, h / 4);
  body.set(facade);
  for (let i = 0; i < pts.length; i++) body.wall(pts[i], pts[(i + 1) % pts.length], plinth, h);
  // Darker base course.
  body.set(facade).color.multiplyScalar(0.78);
  for (let i = 0; i < pts.length; i++) body.wall(pts[i], pts[(i + 1) % pts.length], 0, plinth);
  body.set(top);
  for (const [i, j, l] of THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), [])) {
    body.tri([...pts[i], h], [...pts[j], h], [...pts[l], h]);
  }
  // Parapet.
  body.set(facade);
  for (let i = 0; i < pts.length; i++) body.wall(pts[i], pts[(i + 1) % pts.length], h, h + 2.5);
  // Rooftop units on larger roofs.
  const a = Math.abs(area(pts));
  if (a > 2500) {
    const o = obb(pts);
    const n = a > 12000 ? 3 : a > 6000 ? 2 : 1;
    body.set(P.trim).color.multiplyScalar(0.9);
    for (let i = 0; i < n; i++) {
      const cc = add(add(o.c, o.u, (r() - 0.5) * o.L), [-o.u[1], o.u[0]], (r() - 0.5) * o.W);
      if (inside(pts, cc)) body.box(cc, o.u, 4 + r() * 4, 3 + r() * 3, h, h + 4 + r() * 3);
    }
  }
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 10) continue;
    const n: V2 = [(q[1] - p[1]) / len, -(q[0] - p[0]) / len];
    openings(glass, P, r, p, q, n, Math.min(stories, 20), h / Math.min(stories, 20), false, night, { band: true });
  }
}

/* ---------- entry point ---------- */

export function buildCity(specs: Spec[], theme: Theme): CityMeshes {
  const P = PALETTE[theme] as typeof PALETTE.day;
  const night = theme === 'night';
  const body = new Sink(), glass = new Sink();
  for (const s of specs) {
    const pts = ring(s.g);
    if (pts.length < 3) continue;
    body.owner = glass.owner = s.owner;
    const r = rand(s.seed + 1);
    if (s.kind === 'other') { otherBuilding(body, glass, P, r, s, night, pts); continue; }
    const o = obb(pts);
    const fill = Math.abs(area(pts)) / (4 * o.L * o.W || 1);
    if (s.kind === 'cottage' || (fill > 0.84 && o.W > 6)) boxHouse(body, glass, P, r, s, night, o);
    else freeformHouse(body, glass, P, r, s, night, pts);
  }
  return { body: body.build(), glass: glass.build() };
}

export type { Spec as BuildingSpec };
