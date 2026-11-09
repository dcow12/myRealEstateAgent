// Writes public/data/mailing.json: { [lot OBJECTID]: "City, MD 20740" } for each scanned single-family lot,
// from the county parcel file already on disk (property city and ZIP only; no owner data).
// Used to build Zillow links. Run after `npm run analyze`: `npm run mailing`.
import { readFile, writeFile } from 'node:fs/promises';

const town = JSON.parse(await readFile(new URL('../public/data/town.json', import.meta.url), 'utf8'));
const parcels = JSON.parse(await readFile(new URL('../data/raw/parcels.geojson', import.meta.url), 'utf8'));
const want = new Set(town.lots.map((l) => l.id));
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const out = {};
for (const f of parcels.features) {
  const p = f.properties;
  if (!want.has(p.OBJECTID) || !p.CITY) continue;
  out[p.OBJECTID] = `${title(p.CITY.trim())}, MD${p.ZIP5 ? ' ' + p.ZIP5 : ''}`;
}
await writeFile(new URL('../public/data/mailing.json', import.meta.url), JSON.stringify(out));
console.log(`mailing.json: ${Object.keys(out).length}/${want.size} lots`);
