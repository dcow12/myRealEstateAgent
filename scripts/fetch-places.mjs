// Adds two public datasets the agents use for home search:
//  1. values.json  - each scanned single-family lot's current county assessed value (CURR_ASSESS, PG County SDAT data).
//     Only the assessed value is requested; owner names, mailing addresses and sale records are never downloaded.
//  2. places.json  - named schools, libraries, stations, parks, shops etc. from OpenStreetMap within ~6 miles,
//     so a question like "within 10 minutes of Friends Community School" can be resolved to a point.
// Run after `npm run analyze`: `npm run fetch-places`.
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'plottwist-hackathon/0.1 (housing research prototype)';
const town = JSON.parse(await readFile(new URL('../public/data/town.json', import.meta.url), 'utf8'));
const { lon: lon0, lat: lat0, ftPerDegLat, ftPerDegLon } = town.meta.origin;
const toLocal = (lon, lat) => [Math.round((lon - lon0) * ftPerDegLon), Math.round((lat - lat0) * ftPerDegLat)];

async function post(url, params, tries = 12) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params), headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const j = await res.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 160));
      return j;
    } catch (err) {
      if (attempt >= tries) throw err;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

/* ---------- 1. assessed values ---------- */
const endpoint = 'https://gis.princegeorgescountymd.gov/arcgis/rest/services/Property/Property_Flattened/MapServer/0/query';
const ids = town.lots.map((l) => l.id);
const values = {};
for (let i = 0; i < ids.length; i += 250) {
  const j = await post(endpoint, { objectIds: ids.slice(i, i + 250).join(','), outFields: 'OBJECTID,CURR_ASSESS', returnGeometry: 'false', f: 'json' });
  for (const f of j.features ?? []) {
    const v = Number(f.attributes.CURR_ASSESS);
    if (v > 0) values[f.attributes.OBJECTID] = v;
  }
  if ((i / 250) % 4 === 0) console.log(`values: ${Object.keys(values).length}/${ids.length}`);
}
await writeFile(new URL('../public/data/values.json', import.meta.url), JSON.stringify(values));
console.log(`values.json: ${Object.keys(values).length} lots with an assessed value`);

/* ---------- 2. named places ---------- */
const pad = 0.09; // ~6 miles around the city centre
const [s, w, n, e] = [lat0 - pad, lon0 - pad * 1.25, lat0 + pad, lon0 + pad * 1.25];
const bb = `(${s},${w},${n},${e})`;
const q = `[out:json][timeout:120];
(
  nwr["amenity"~"^(school|university|college|kindergarten|childcare|library|hospital|clinic|place_of_worship|community_centre|townhall|fire_station|police|post_office|marketplace)$"]["name"]${bb};
  nwr["shop"~"^(supermarket|mall|department_store)$"]["name"]${bb};
  nwr["railway"="station"]["name"]${bb};
  nwr["public_transport"="station"]["name"]${bb};
  nwr["leisure"~"^(park|sports_centre|stadium)$"]["name"]${bb};
);
out center tags;`;
const osm = await post('https://overpass-api.de/api/interpreter', { data: q }, 4);
const seen = new Set();
const places = [];
for (const el of osm.elements) {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) continue;
  const t = el.tags;
  const kind = t.amenity ?? t.shop ?? (t.railway || t.public_transport ? 'station' : t.leisure) ?? 'place';
  const key = t.name.toLowerCase() + '|' + kind;
  if (seen.has(key)) continue;
  seen.add(key);
  const [x, y] = toLocal(lon, lat);
  places.push({ name: t.name, kind, x, y, addr: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || undefined });
}
places.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(new URL('../public/data/places.json', import.meta.url), JSON.stringify(places));
console.log(`places.json: ${places.length} named places`);
