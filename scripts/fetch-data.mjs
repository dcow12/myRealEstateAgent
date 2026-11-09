// Pulls every parcel inside the City of College Park plus building footprints and streets.
// Sources: Prince George's County GIS (parcels, city boundary) and OpenStreetMap via Overpass (buildings, roads).
// Privacy: we request an explicit allowlist of fields. Owner names, mailing addresses and sale prices are
// never downloaded. Assessed values are fetched separately by fetch-places.mjs (value only, no owner data).
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const RAW = new URL('../data/raw/', import.meta.url);
const COUNTY = 'https://gis.princegeorgescountymd.gov/arcgis/rest/services';
const UA = 'myrealestateagent-hackathon/0.1 (housing research prototype)';

const PARCEL_FIELDS = [
  'OBJECTID', 'ACCOUNT', 'LAND_AREA_SQFT', 'HOUSE_NUMBER', 'HOUSE_SUFFIX', 'STREET_NAME', 'STREET_TYPE', 'STREET_DIRECTION',
  'CITY', 'ZIP5', 'DWELLING_TYPE', 'DWELLING_UNITS', 'DWELLING_STORY_CODE', 'STRUCTURE_SQ_FT', 'YEAR_BUILT',
  'RESIDENTIAL_IND', 'DEVELOPED', 'ZONE_CODE1', 'ZONE_MULTIPLES', 'FLOOD_PLAIN', 'HISTORIC_DISTRICT_ID', 'HISTORIC_SITE',
  'CONDO_UNIT_NUMBER', 'MNCPPC_USE',
];

async function getJson(url, init = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw err;
      console.warn(`  retry ${attempt} (${err.message})`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function boundary() {
  const url = `${COUNTY}/BOUNDARIES/Boundaries/MapServer/1/query?where=NAME%3D%27COLLEGE+PARK%27&outFields=NAME,ACREAGE&outSR=4326&f=geojson`;
  const gj = await getJson(url);
  if (!gj.features?.length) throw new Error('College Park boundary not found');
  return gj;
}

async function parcels(boundaryGeo) {
  // Polygon filters fail on this server, so query the bounding box and clip to the city later.
  const [xmin, ymin, xmax, ymax] = bboxOf(boundaryGeo);
  const geometry = JSON.stringify({ xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } });
  const endpoint = `${COUNTY}/Property/Property_Flattened/MapServer/0/query`;
  // This server fails at random (some backends reject identical requests), so retry error bodies.
  const post = async (params) => {
    for (let attempt = 1; ; attempt++) {
      const r = await getJson(endpoint, {
        method: 'POST', body: new URLSearchParams(params), headers: { 'content-type': 'application/x-www-form-urlencoded' },
      });
      if (!r.error) return r;
      if (attempt >= 12) throw new Error(`county GIS kept failing: ${JSON.stringify(r.error).slice(0, 200)}`);
      await new Promise((res) => setTimeout(res, 300 * attempt));
    }
  };
  // The server refuses pagination, so list the ids first and fetch them in batches.
  const ids = await post({
    where: '1=1', geometry, geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', returnIdsOnly: 'true', f: 'json',
  });
  if (!ids.objectIds) throw new Error(`id query failed: ${JSON.stringify(ids).slice(0, 300)}`);
  const all = ids.objectIds.sort((a, b) => a - b);
  console.log(`  ${all.length} parcel ids`);
  const out = [];
  for (let i = 0; i < all.length; i += 250) {
    const gj = await post({
      objectIds: all.slice(i, i + 250).join(','), outFields: PARCEL_FIELDS.join(','),
      returnGeometry: 'true', outSR: '4326', f: 'json',
    });
    if (!gj.features) throw new Error(`batch failed: ${JSON.stringify(gj).slice(0, 300)}`);
    // Esri JSON -> GeoJSON-like features (rings kept as-is; analysis handles orientation).
    for (const f of gj.features) {
      if (!f.geometry?.rings) continue;
      out.push({ type: 'Feature', properties: f.attributes, geometry: { type: 'Polygon', coordinates: f.geometry.rings } });
    }
    if ((i / 250) % 8 === 0) console.log(`  parcels: ${out.length}/${all.length}`);
  }
  return { type: 'FeatureCollection', features: out };
}

async function osm(bbox) {
  const [w, s, e, n] = bbox;
  const q = `[out:json][timeout:180];
  (
    way["building"](${s},${w},${n},${e});
    way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|primary_link|secondary_link|tertiary_link|trunk_link|service)$"](${s},${w},${n},${e});
  );
  out tags geom;`;
  return getJson('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

function bboxOf(gj) {
  const pts = gj.features[0].geometry.coordinates.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = 0.002;
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
}

await mkdir(RAW, { recursive: true });
const force = process.argv.includes('--force');
const cached = async (name, fn) => {
  const file = new URL(name, RAW);
  if (!force && existsSync(file)) { console.log(`cached ${name}`); return JSON.parse(await readFile(file, 'utf8')); }
  console.log(`fetching ${name}…`);
  const data = await fn();
  await writeFile(file, JSON.stringify(data));
  return data;
};

const b = await cached('college-park-boundary.geojson', boundary);
await cached('parcels.geojson', () => parcels(b));
await cached('osm.json', () => osm(bboxOf(b)));
console.log('done. Run: npm run analyze');
