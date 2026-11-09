// Runs the myRealEstateAgent site scan + rules engine on every single-family home in College Park.
// Input: data/raw (from fetch-data.mjs). Output: public/data/town.json (3D + agents) and data/derived/summary.json.
// Run: node scripts/analyze.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  ZONES, ASSUMPTIONS, SETBACK_STEPS, SEPARATION_STEPS, BASE_POLICY, scenarioIndex, evaluate, cityStats, rankRelaxations,
  type LotFacts,
} from '../lib/engine/rules.ts';
import { scanSite, fitCottage, ringArea, centroid, pointInRing, segDist, ringDist, type Ring, type Pt, type Edge } from '../lib/engine/site.ts';

const root = new URL('../', import.meta.url);
const load = async (p: string) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const t0 = Date.now();

const boundaryGj = await load('data/raw/college-park-boundary.geojson');
const parcelsGj = await load('data/raw/parcels.geojson');
const osm = await load('data/raw/osm.json');

// ---------- Projection to local feet ----------
const bRingLL: [number, number][] = boundaryGj.features[0].geometry.coordinates[0];
const lon0 = bRingLL.reduce((s, p) => s + p[0], 0) / bRingLL.length;
const lat0 = bRingLL.reduce((s, p) => s + p[1], 0) / bRingLL.length;
const FT_LAT = 364000;
const FT_LON = FT_LAT * Math.cos((lat0 * Math.PI) / 180);
const proj = (lon: number, lat: number): Pt => [(lon - lon0) * FT_LON, (lat - lat0) * FT_LAT];
const boundary: Ring = bRingLL.map(([x, y]) => proj(x, y));
const bx = boundary.map((p) => p[0]), by = boundary.map((p) => p[1]);
const extent = { minX: Math.min(...bx) - 300, maxX: Math.max(...bx) + 300, minY: Math.min(...by) - 300, maxY: Math.max(...by) + 300 };
const inExtent = ([x, y]: Pt) => x > extent.minX && x < extent.maxX && y > extent.minY && y < extent.maxY;

// ---------- Grid index ----------
const G = 250;
class Grid<T> {
  m = new Map<string, T[]>();
  add(minx: number, miny: number, maxx: number, maxy: number, v: T) {
    for (let gx = Math.floor(minx / G); gx <= Math.floor(maxx / G); gx++)
      for (let gy = Math.floor(miny / G); gy <= Math.floor(maxy / G); gy++) {
        const k = gx + ',' + gy;
        (this.m.get(k) ?? this.m.set(k, []).get(k)!).push(v);
      }
  }
  near(x: number, y: number, r: number): T[] {
    const out = new Set<T>();
    for (let gx = Math.floor((x - r) / G); gx <= Math.floor((x + r) / G); gx++)
      for (let gy = Math.floor((y - r) / G); gy <= Math.floor((y + r) / G); gy++)
        for (const v of this.m.get(gx + ',' + gy) ?? []) out.add(v);
    return [...out];
  }
}
const bboxOf = (pts: Pt[]) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d] as const;
};

// ---------- OSM buildings and roads ----------
type Bld = { ring: Ring; area: number; c: Pt; h: number; tag: string; parcel: number };
type Seg = { a: Pt; b: Pt; service: boolean };
const buildings: Bld[] = [];
const roads: { pts: Pt[]; kind: string }[] = [];
const bGrid = new Grid<Bld>();
const rGrid = new Grid<Seg>();
const parseHeightFt = (tags: Record<string, string>) => {
  const h = parseFloat(tags.height ?? '');
  if (h > 0) return h * 3.281;
  const lv = parseFloat(tags['building:levels'] ?? '');
  if (lv > 0) return lv * 10.5 + 4;
  return ['shed', 'garage', 'garages', 'carport', 'roof'].includes(tags.building) ? 10 : 22;
};
for (const e of osm.elements) {
  if (e.type !== 'way' || !e.geometry) continue;
  const pts: Pt[] = e.geometry.map((g: { lat: number; lon: number }) => proj(g.lon, g.lat));
  if (e.tags?.building) {
    if (pts.length < 4) continue;
    const ring = pts.slice(0, -1);
    const area = ringArea(ring);
    if (area < 40 || !inExtent(ring[0])) continue;
    const b: Bld = { ring, area, c: centroid(ring), h: Math.round(parseHeightFt(e.tags)), tag: e.tags.building, parcel: 0 };
    buildings.push(b);
    const [x0, y0, x1, y1] = bboxOf(ring);
    bGrid.add(x0, y0, x1, y1, b);
  } else if (e.tags?.highway) {
    const service = e.tags.highway === 'service';
    roads.push({ pts, kind: e.tags.highway });
    for (let i = 0; i + 1 < pts.length; i++) {
      const s: Seg = { a: pts[i], b: pts[i + 1], service };
      rGrid.add(Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.max(s.a[0], s.b[0]), Math.max(s.a[1], s.b[1]), s);
    }
  }
}
const roadDist = (x: number, y: number, r: number, allowService: boolean) => {
  let d = Infinity;
  for (const s of rGrid.near(x, y, r)) if (allowService || !s.service) d = Math.min(d, segDist(x, y, s.a[0], s.a[1], s.b[0], s.b[1]));
  return d;
};

// ---------- Parcels, grouped by tax account ----------
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
const addrOf = (p: Record<string, string | null>) => {
  const num = (p.HOUSE_NUMBER ?? '').replace(/^0+/, '');
  if (!num || !p.STREET_NAME) return '';
  return [num + (p.HOUSE_SUFFIX ?? ''), p.STREET_DIRECTION, title(p.STREET_NAME), p.STREET_TYPE ? title(p.STREET_TYPE) : ''].filter(Boolean).join(' ');
};

type Group = { key: string; props: Record<string, any>; rings: Ring[]; here: Bld[]; c: Pt };
const groups = new Map<string, Group>();
for (const f of parcelsGj.features) {
  const ringLL: [number, number][] = f.geometry.coordinates[0];
  if (!ringLL || ringLL.length < 4) continue;
  let ring: Ring = ringLL.map(([x, y]) => proj(x, y));
  if (ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
  const c = centroid(ring);
  if (!pointInRing(c[0], c[1], boundary)) continue;
  const key = (f.properties.ACCOUNT ?? '').trim() || `oid-${f.properties.OBJECTID}`;
  const g = groups.get(key);
  if (!g) groups.set(key, { key, props: f.properties, rings: [ring], here: [], c });
  else {
    // Skip exact duplicates of a ring we already have.
    const dup = g.rings.some((r) => Math.hypot(centroid(r)[0] - c[0], centroid(r)[1] - c[1]) < 1 && Math.abs(ringArea(r) - ringArea(ring)) < 5);
    if (!dup) g.rings.push(ring);
  }
}
const inGroup = (x: number, y: number, g: Group) => g.rings.some((r) => pointInRing(x, y, r));
const distToGroup = (p: Pt, g: Group) => Math.min(...g.rings.map((r) => ringDist(p[0], p[1], r)));

// Pass 1: buildings claimed by centroid (non-exclusive; parcels can overlap).
for (const g of groups.values()) {
  const all = g.rings.flat();
  const [x0, y0, x1, y1] = bboxOf(all);
  g.c = centroid(all);
  g.here = bGrid.near((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 10).filter((b) => inGroup(b.c[0], b.c[1], g));
  for (const b of g.here) if (!b.parcel) b.parcel = g.props.OBJECTID;
}
// Pass 2: homes with no footprint claim the biggest unclaimed building within 30 ft (outlines and lot lines are often offset).
for (const g of groups.values()) {
  if ((g.props.MNCPPC_USE ?? '').trim() !== 'SFD' || g.here.length) continue;
  const all = g.rings.flat();
  const [x0, y0, x1, y1] = bboxOf(all);
  const cand = bGrid.near((x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2 + 40)
    .filter((b) => b.parcel === 0 && b.area >= 400 && (inGroup(b.c[0], b.c[1], g) || distToGroup(b.c, g) <= 30))
    .sort((a, b) => b.area - a.area);
  if (cand[0]) { cand[0].parcel = g.props.OBJECTID; g.here.push(cand[0]); }
}

/** Outer lot lines of a (possibly merged) lot: drop edges shared with another ring in the same lot. */
function outerEdges(g: Group): { a: Pt; b: Pt; len: number }[] {
  const out: { a: Pt; b: Pt; len: number }[] = [];
  g.rings.forEach((r, ri) => {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const shared = g.rings.some((o, oi) => oi !== ri && ringDist(mx, my, o) < 2);
      if (!shared) out.push({ a, b, len });
    }
  });
  return out;
}

type OutParcel = { id: number; use: string; zone: string; poly: number[]; lot: number };
const outParcels: OutParcel[] = [];
const estimatedHouses: { parcel: number; ring: Ring }[] = [];
const lots: (LotFacts & { pos: Pt; cottage: number[] | null; rings: number })[] = [];

for (const g of groups.values()) {
  const props = g.props;
  const use = (props.MNCPPC_USE ?? '').trim() || 'UNK';
  const zone = (props.ZONE_CODE1 ?? '').trim();
  const lotIndex = use === 'SFD' ? lots.length : -1;
  for (const r of g.rings) {
    outParcels.push({ id: props.OBJECTID, use, zone, poly: r.flatMap((p) => [Math.round(p[0]), Math.round(p[1])]), lot: lotIndex });
  }
  if (use !== 'SFD') continue;

  const here = [...g.here].sort((a, b) => b.area - a.area);
  const ringsArea = g.rings.reduce((s, r) => s + ringArea(r), 0);
  const lotSqft = Math.round(props.LAND_AREA_SQFT || ringsArea);
  const accessory = here.slice(1).filter((b) => b.area >= 80);
  const facts: LotFacts = {
    id: props.OBJECTID,
    addr: addrOf(props),
    zone,
    lotSqft,
    livingSqft: parseInt(props.STRUCTURE_SQ_FT ?? '0', 10) || 0,
    year: parseInt(props.YEAR_BUILT ?? '', 10) || null,
    historic: props.HISTORIC_DISTRICT_ID === 'Y',
    footprintSqft: Math.round(here.reduce((s, b) => s + b.area, 0)),
    houseFootprintSqft: Math.round(here[0]?.area ?? 0),
    accessorySqft: Math.round(accessory[0]?.area ?? 0),
    accessoryIsGarage: ['garage', 'garages', 'carport'].includes(accessory[0]?.tag ?? ''),
    rects: [],
    scan: 'ok',
  };
  let corners: (Ring | null)[] = [];
  const zr = ZONES[zone];

  if (!here.length && !facts.livingSqft) facts.scan = 'no-building';
  else if (zr) {
    // Front = the outer lot line closest to a public street (fall back to alleys/service roads).
    const outer = outerEdges(g);
    type Scored = (typeof outer)[number] & { d: number };
    const pick = (allowService: boolean): Scored | null => {
      let best: Scored | null = null;
      for (const e of outer) {
        const d = e.len < 8 ? Infinity : roadDist((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 300, allowService);
        if (!best || d < best.d) best = { ...e, d };
      }
      return best && isFinite(best.d) ? best : null;
    };
    const front = pick(false) ?? pick(true);
    if (!front) facts.scan = 'no-street';
    else {
      const ux = (front.b[0] - front.a[0]) / front.len, uy = (front.b[1] - front.a[1]) / front.len;
      const edges: Edge[] = outer.map((e) => {
        if (e.a === front.a && e.b === front.b) return { a: e.a, b: e.b, kind: 'front' };
        const ex = (e.b[0] - e.a[0]) / e.len, ey = (e.b[1] - e.a[1]) / e.len;
        const parallel = Math.abs(ex * ux + ey * uy) > 0.9;
        const offFront = Math.abs((e.a[0] - front.a[0]) * -uy + (e.a[1] - front.a[1]) * ux);
        // Co-linear pieces of the same frontage (merged lots) face the street too.
        if (parallel && offFront < 3) return { a: e.a, b: e.b, kind: 'street' };
        const d = e.len >= 20 ? roadDist((e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, 60, false) : Infinity;
        return { a: e.a, b: e.b, kind: d < 45 ? 'street' : 'line' };
      });

      let houseRings = here.map((b) => b.ring);
      if (!here.length) {
        // No footprint in OpenStreetMap: estimate a house box from county living area (1.5 stories),
        // centered on the lot at the front-yard setback.
        facts.scan = 'estimated';
        const fp = facts.livingSqft / 1.5;
        let nx = -uy, ny = ux;
        if ((g.c[0] - front.a[0]) * nx + (g.c[1] - front.a[1]) * ny < 0) { nx = -nx; ny = -ny; }
        const sMid = (g.c[0] - front.a[0]) * ux + (g.c[1] - front.a[1]) * uy;
        const sAll = g.rings.flat().map((p) => (p[0] - front.a[0]) * ux + (p[1] - front.a[1]) * uy);
        const width = Math.max(...sAll) - Math.min(...sAll);
        const w = Math.max(18, Math.min(width - 16, Math.sqrt(fp * 1.3)));
        const d = fp / w;
        const at = (s: number, t: number): Pt => [front.a[0] + ux * s + nx * t, front.a[1] + uy * s + ny * t];
        const tf = zr.frontYardFt;
        houseRings = [[at(sMid - w / 2, tf), at(sMid + w / 2, tf), at(sMid + w / 2, tf + d), at(sMid - w / 2, tf + d)]];
        facts.houseFootprintSqft = Math.round(fp);
        facts.footprintSqft = Math.round(fp);
        estimatedHouses.push({ parcel: facts.id, ring: houseRings[0] });
      }
      const out = scanSite({
        rings: g.rings,
        edges,
        buildings: houseRings,
        frontYardFt: zr.frontYardFt,
        cornerSideYardFt: 25,
        setbacks: SETBACK_STEPS,
        separations: SEPARATION_STEPS,
        minWidthFt: ASSUMPTIONS.minWidthFt,
      });
      facts.rects = out.rects;
      corners = out.rectCorners;
    }
  }

  const r = evaluate(facts, BASE_POLICY);
  const baseRect = corners[scenarioIndex(BASE_POLICY.setbackFt, BASE_POLICY.separationFt)];
  const cottage = r.best?.kind === 'detached' && baseRect
    ? fitCottage(baseRect, r.best.sqft, ASSUMPTIONS.minWidthFt).flatMap((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])
    : null;
  lots.push({ ...facts, pos: [Math.round(g.c[0]), Math.round(g.c[1])], cottage, rings: g.rings.length });
  if (lots.length % 1000 === 0) console.log(`  scanned ${lots.length} homes (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}

// ---------- Write ----------
const stats = cityStats(lots);
const relax = rankRelaxations(lots);
const zoneCounts: Record<string, number> = {};
for (const l of lots) zoneCounts[l.zone] = (zoneCounts[l.zone] ?? 0) + 1;
const scanCounts: Record<string, number> = {};
for (const l of lots) scanCounts[l.scan] = (scanCounts[l.scan] ?? 0) + 1;

const keptBuildings = buildings.filter((b) => pointInRing(b.c[0], b.c[1], boundary) || b.parcel);
const pack = (r: Ring, q = 2) => r.flatMap((p) => [Math.round(p[0] * q) / q, Math.round(p[1] * q) / q]);
const town = {
  meta: {
    generatedAt: new Date().toISOString(),
    place: 'City of College Park, Maryland',
    origin: { lon: lon0, lat: lat0, ftPerDegLat: FT_LAT, ftPerDegLon: Math.round(FT_LON) },
    counts: { parcels: outParcels.length, accounts: groups.size, singleFamily: lots.length, buildings: keptBuildings.length, estimatedHouses: estimatedHouses.length, roads: roads.length },
    stats,
    relax,
    zoneCounts,
    scanCounts,
    sources: [
      "Prince George's County GIS: Property_Flattened parcels and municipal boundary (gis.princegeorgescountymd.gov)",
      'OpenStreetMap contributors via Overpass API: building footprints/heights and streets (ODbL)',
      "PG County Zoning Ordinance Sec. 27-4202 dimensional standards; accessory structure rules (enCodePlus)",
      'Maryland HB 1466 / SB 891 (2025), Ch. 196',
      'HUD FY2026 Washington-Arlington-Alexandria income limits and Fair Market Rents',
    ],
  },
  boundary: pack(boundary, 1),
  parcels: outParcels,
  lots,
  buildings: [
    ...keptBuildings.map((b) => ({ h: b.h, p: b.parcel, g: pack(b.ring) })),
    ...estimatedHouses.map((e) => ({ h: 22, p: e.parcel, est: 1, g: pack(e.ring) })),
  ],
  roads: roads.filter((r) => r.pts.some(inExtent)).map((r) => ({ k: r.kind, g: pack(r.pts, 1) })),
};

await mkdir(new URL('public/data/', root), { recursive: true });
await mkdir(new URL('data/derived/', root), { recursive: true });
const json = JSON.stringify(town);
await writeFile(new URL('public/data/town.json', root), json);
await writeFile(new URL('data/derived/summary.json', root), JSON.stringify({ meta: town.meta }, null, 2));
console.log(`\nCollege Park: ${outParcels.length} parcel polygons, ${groups.size} tax accounts, ${lots.length} single-family homes, ${keptBuildings.length} buildings`);
console.log('Scan:', scanCounts);
console.log('Base verdicts:', stats);
console.log('Best single rule change:', relax.map((r) => `${r.extraHomes} <- ${r.label}`));
console.log(`town.json ${(json.length / 1e6).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
