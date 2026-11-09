// Site scan: finds the biggest cottage-sized rectangle that fits behind a real house on a real lot.
// Geometry is in local feet (x east, y north).

export type Pt = [number, number];
export type Ring = Pt[];

export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

export function centroid(r: Ring): Pt {
  let x = 0, y = 0;
  for (const p of r) { x += p[0]; y += p[1]; }
  return [x / r.length, y / r.length];
}

export function pointInRing(x: number, y: number, r: Ring): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx - px, cy = ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

export function ringDist(px: number, py: number, r: Ring): number {
  let d = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) d = Math.min(d, segDist(px, py, r[j][0], r[j][1], r[i][0], r[i][1]));
  return d;
}

export type Edge = { a: Pt; b: Pt; kind: 'front' | 'street' | 'line' };

export type SiteInput = {
  rings: Ring[]; // one home's lot, possibly several platted lots merged
  edges: Edge[]; // outer lot lines only (shared interior lines removed), exactly one 'front'
  buildings: Ring[]; // footprints on this lot, main house first
  frontYardFt: number;
  cornerSideYardFt: number; // 25 ft street-side setback on corner lots
  setbacks: readonly number[];
  separations: readonly number[];
  minWidthFt: number;
};

export type SiteOutput = {
  rects: number[]; // best area per (setback, separation), row-major
  rectCorners: (Ring | null)[]; // best rectangle per scenario (local feet), for drawing
};

/**
 * Rasterize the lot in a frame aligned with the street, then for each scenario find the largest
 * axis-aligned rectangle of buildable cells whose sides are both >= minWidthFt.
 */
export function scanSite(inp: SiteInput): SiteOutput {
  const front = inp.edges.find((e) => e.kind === 'front')!;
  const a = front.a, b = front.b;
  let ux = b[0] - a[0], uy = b[1] - a[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  let nx = -uy, ny = ux;
  const all = inp.rings.flat();
  const c = centroid(all);
  if ((c[0] - a[0]) * nx + (c[1] - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
  const toST = (p: Pt): Pt => [(p[0] - a[0]) * ux + (p[1] - a[1]) * uy, (p[0] - a[0]) * nx + (p[1] - a[1]) * ny];
  const toXY = (s: number, t: number): Pt => [a[0] + s * ux + t * nx, a[1] + s * uy + t * ny];

  const RS = inp.rings.map((r) => r.map(toST));
  const B = inp.buildings.map((r) => r.map(toST));
  const E = inp.edges.map((e) => ({ a: toST(e.a), b: toST(e.b), kind: e.kind }));
  const main = B[0];
  const houseFront = main ? Math.min(...main.map((p) => p[1])) : 0;
  const minT = Math.max(inp.frontYardFt, houseFront);

  const area = inp.rings.reduce((s, r) => s + ringArea(r), 0);
  const cell = area > 60000 ? 4 : 2;
  const allST = RS.flat();
  const smin = Math.min(...allST.map((p) => p[0])), smax = Math.max(...allST.map((p) => p[0]));
  const tmin = Math.min(...allST.map((p) => p[1])), tmax = Math.max(...allST.map((p) => p[1]));
  const cols = Math.max(1, Math.ceil((smax - smin) / cell));
  const rows = Math.max(1, Math.ceil((tmax - tmin) / cell));

  const N = rows * cols;
  const dLine = new Float32Array(N).fill(-1); // -1 = not usable at all
  const dBld = new Float32Array(N);
  for (let r = 0; r < rows; r++) {
    const t = tmin + (r + 0.5) * cell;
    if (t < minT) continue;
    for (let q = 0; q < cols; q++) {
      const s = smin + (q + 0.5) * cell;
      if (!RS.some((ring) => pointInRing(s, t, ring))) continue;
      let line = Infinity, ok = true;
      for (const e of E) {
        const d = segDist(s, t, e.a[0], e.a[1], e.b[0], e.b[1]);
        if (e.kind === 'line') line = Math.min(line, d);
        else if (e.kind === 'street' && d < inp.cornerSideYardFt) { ok = false; break; }
      }
      if (!ok) continue;
      let bd = Infinity;
      for (const ring of B) {
        if (pointInRing(s, t, ring)) { bd = 0; break; }
        bd = Math.min(bd, ringDist(s, t, ring));
      }
      if (bd === 0) continue;
      // Cell centers sit cell/2 inside the cell edge; subtract it so the whole cell clears the setback.
      dLine[r * cols + q] = line - cell / 2;
      dBld[r * cols + q] = bd - cell / 2;
    }
  }

  const minCells = Math.ceil(inp.minWidthFt / cell);
  const rects: number[] = [];
  const rectCorners: (Ring | null)[] = [];
  const heights = new Int32Array(cols);
  for (const sb of inp.setbacks) {
    for (const sep of inp.separations) {
      heights.fill(0);
      let best = 0, bestRect: [number, number, number, number] | null = null; // row, colL, colR, h
      for (let r = 0; r < rows; r++) {
        for (let q = 0; q < cols; q++) {
          const i = r * cols + q;
          heights[q] = dLine[i] >= sb && dBld[i] >= sep ? heights[q] + 1 : 0;
        }
        // Largest rectangle in a histogram, keeping only rectangles with both sides >= minCells.
        const stack: number[] = [];
        for (let q = 0; q <= cols; q++) {
          const h = q === cols ? 0 : heights[q];
          while (stack.length && heights[stack[stack.length - 1]] >= h) {
            const top = stack.pop()!;
            const hh = heights[top];
            const left = stack.length ? stack[stack.length - 1] + 1 : 0;
            const w = q - left;
            if (hh >= minCells && w >= minCells && hh * w > best) { best = hh * w; bestRect = [r, left, q - 1, hh]; }
          }
          stack.push(q);
        }
      }
      rects.push(Math.round(best * cell * cell));
      if (bestRect) {
        const [r, l, rr, h] = bestRect;
        const s0 = smin + l * cell, s1 = smin + (rr + 1) * cell;
        const t1 = tmin + (r + 1) * cell, t0 = t1 - h * cell;
        rectCorners.push([toXY(s0, t0), toXY(s1, t0), toXY(s1, t1), toXY(s0, t1)]);
      } else rectCorners.push(null);
    }
  }
  return { rects, rectCorners };
}

/** Shrink a rectangle (4 corners, in order) to `sqft`, keeping it at the far (rear) side. */
export function fitCottage(rect: Ring, sqft: number, minWidthFt: number): Ring {
  const [p0, p1, , p3] = rect;
  const W = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const D = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  let w = Math.min(W, Math.max(minWidthFt, Math.sqrt(sqft * 1.4)));
  let d = sqft / w;
  if (d > D) { d = D; w = Math.min(W, sqft / d); }
  const ux = (p1[0] - p0[0]) / W, uy = (p1[1] - p0[1]) / W;
  const vx = (p3[0] - p0[0]) / D, vy = (p3[1] - p0[1]) / D;
  const s0 = (W - w) / 2, t0 = D - d; // centered across, pushed to the rear
  const at = (s: number, t: number): Pt => [p0[0] + ux * s + vx * t, p0[1] + uy * s + vy * t];
  return [at(s0, t0), at(s0 + w, t0), at(s0 + w, t0 + d), at(s0, t0 + d)];
}
