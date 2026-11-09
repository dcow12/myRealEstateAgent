// Builds merged three.js geometry for the whole city: a handful of draw calls for ~9k buildings and ~9k parcels.
// Data is in local feet (x east, y north). Scene: X = x, Y = up, Z = -y.
import * as THREE from 'three';
import { evaluate, type Policy, type Verdict } from '../engine/rules.ts';
import type { TownData } from './types.ts';

const toV2 = (g: number[]) => {
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < g.length; i += 2) out.push(new THREE.Vector2(g[i], g[i + 1]));
  if (out.length > 2 && out[0].equals(out[out.length - 1])) out.pop();
  return out;
};

/** Cottage boxes on the map. */
export const COTTAGE_COLOR = '#2D5BD8';

export const VERDICT_COLORS: Record<Verdict | 'other', string> = {
  yes: '#4C9F6E',
  maybe: '#D3A13A',
  no: '#C9604A',
  review: '#9CA1A9',
  other: '#E4E4E7',
};

type Built = { geometry: THREE.BufferGeometry; triOwner: Int32Array };

/** Extruded prisms (walls + flat roof), merged. owner(i) tags each triangle for picking. */
export function extrude(rings: { g: number[]; h: number; base?: number; color: THREE.Color; owner: number }[]): Built {
  const pos: number[] = [], col: number[] = [], owners: number[] = [];
  for (const r of rings) {
    let pts = toV2(r.g);
    if (pts.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    const y0 = r.base ?? 0, y1 = y0 + r.h;
    const c = r.color;
    // Walls, slightly darker for a bit of depth.
    const wc = c.clone().multiplyScalar(0.82);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const quad = [a.x, y0, -a.y, b.x, y0, -b.y, b.x, y1, -b.y, a.x, y0, -a.y, b.x, y1, -b.y, a.x, y1, -a.y];
      pos.push(...quad);
      for (let k = 0; k < 6; k++) col.push(wc.r, wc.g, wc.b);
      owners.push(r.owner, r.owner);
    }
    // Roof.
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const [i, j, k] of tris) {
      for (const p of [pts[i], pts[j], pts[k]]) { pos.push(p.x, y1, -p.y); col.push(c.r, c.g, c.b); }
      owners.push(r.owner);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, triOwner: Int32Array.from(owners) };
}

/** Flat lot fills for single-family homes; triOwner = lot index. Colors updated per policy. */
export function lotFills(town: TownData, y = 0.6): Built {
  const pos: number[] = [], owners: number[] = [];
  for (const p of town.parcels) {
    if (p.lot < 0) continue;
    let pts = toV2(p.poly);
    if (pts.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(pts)) pts = pts.reverse();
    for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(pts, [])) {
      for (const q of [pts[i], pts[j], pts[k]]) pos.push(q.x, y, -q.y);
      owners.push(p.lot);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, triOwner: Int32Array.from(owners) };
}

export function verdictsFor(town: TownData, policy: Policy): Verdict[] {
  return town.lots.map((l) => evaluate(l, policy).verdict);
}

export function paintLots(built: Built, verdicts: Verdict[]) {
  const attr = built.geometry.getAttribute('color') as THREE.BufferAttribute;
  const palette = Object.fromEntries(Object.entries(VERDICT_COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
  for (let t = 0; t < built.triOwner.length; t++) {
    const c = palette[verdicts[built.triOwner[t]]] ?? palette.other;
    for (let v = 0; v < 3; v++) attr.setXYZ(t * 3 + v, c.r, c.g, c.b);
  }
  attr.needsUpdate = true;
}

/** Thin line segments for every parcel outline (context). */
export function parcelLines(town: TownData, y = 0.8): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of town.parcels) {
    const g = p.poly;
    const n = g.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      pos.push(g[i * 2], y, -g[i * 2 + 1], g[j * 2], y, -g[j * 2 + 1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geometry;
}

const ROAD_WIDTH: Record<string, number> = {
  motorway: 60, trunk: 50, primary: 44, secondary: 38, tertiary: 32, residential: 26, unclassified: 24, living_street: 20, service: 12,
};

/** Road ribbons as flat quads. */
export function roadRibbons(town: TownData, y = 0.3): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const r of town.roads) {
    const w = (ROAD_WIDTH[r.k] ?? 20) / 2;
    const g = r.g;
    for (let i = 0; i + 3 < g.length; i += 2) {
      const ax = g[i], ay = g[i + 1], bx = g[i + 2], by = g[i + 3];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (-(by - ay) / len) * w, ny = ((bx - ax) / len) * w;
      const A = [ax + nx, y, -(ay + ny)], B = [ax - nx, y, -(ay - ny)], C = [bx - nx, y, -(by - ny)], D = [bx + nx, y, -(by + ny)];
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function ringPoints(g: number[], y: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < g.length; i += 2) out.push([g[i], y, -g[i + 1]]);
  if (out.length) out.push(out[0]);
  return out;
}

export const toScene = (x: number, y: number, h = 0): [number, number, number] => [x, h, -y];
