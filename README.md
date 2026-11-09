# myRealEstateAgent

**Turn a homeowner's backyard into the next affordable home on the block.**

myRealEstateAgent is an AI agent that takes one street address and tells the homeowner, in plain language, whether they can legally build a small second home on their lot (an accessory dwelling unit, or ADU), what it would cost, how to pay for it, and what it would mean to rent it at a price a local teacher, nurse or grad student could afford.

---

## The problem

The DMV doesn't have enough homes, and the region has very little land left for new ones. The housing that's easiest to add, a backyard cottage, a basement apartment or a converted garage, almost never gets built. Land, money and permission aren't usually what stops it. Confusion is:

- **The rules just changed, and they're scattered.** Maryland's 2025 ADU law (HB 1466 / SB 891, Ch. 196) took effect Oct 1, 2025. It requires local governments to allow ADUs on single-family-detached lots by Oct 1, 2026, and caps an ADU at 75% of the main house's size. Prince George's County passed its own ADU bill, CB-074-2026, in late September 2026, after years in which new ADUs were essentially not allowed. Setbacks, lot coverage, parking and utility hookups still live in different documents from different agencies, and most homeowners have no idea any of this changed.
- **Costs are a black box.** Homeowners can't tell whether they're looking at $60k or $300k, so they never call a contractor.
- **Help is invisible.** State and county loan, grant and tax-credit programs exist, but they're hard to find and harder to qualify for.
- **Affordability is an afterthought.** Even when an ADU gets built, nothing pushes the owner to rent it at an affordable price.

The result: lots that could each hold one more home stay empty. These would be small homes for people who are priced out today, and they need no new roads, no displacement and no high-rise fights.

## Who it's for

1. **Homeowners**, especially older owners and owners on fixed incomes, who could use rental income to stay in their homes. They need a clear answer about what's possible on their lot.
2. **City planners and housing nonprofits**, who need to know *where* gentle density is possible across a whole neighborhood, not just one lot at a time.
3. **Renters**, who end up with more small, mid-priced homes near transit and campus.

## How it works

The homeowner types an address. An agent runs a short, visible pipeline:

| Step | Agent action | Data / tool |
|---|---|---|
| 1. Locate | Geocode the address and pull the parcel boundary | Google Maps Geocoding, county open parcel data (PG County / MD iMAP) |
| 2. See | Look at the satellite view to estimate open yard area, existing structures and trees | Maps Static satellite tile → Gemini vision |
| 3. Check rules | Match the parcel's zone to an ADU rules table (size caps, setbacks, height, parking) and calculate the buildable footprint | Hand-curated rules JSON with links to the code sections |
| 4. Price it | Estimate build cost for 3 ADU types (garage conversion, basement unit, detached cottage) | Regional cost-per-sq-ft ranges |
| 5. Fund it | Find financing programs the owner may qualify for | Curated list of MD DHCD and county programs |
| 6. Make it affordable | Show the rent at market vs. affordable (60–80% AMI) levels and what each does to the monthly payback | HUD Fair Market Rents, AMI tables |
| 7. Explain | Write a one-page "Lot Report" in plain English or Spanish, with every claim cited | Gemini |

**Neighborhood mode (the planner view):** run the same pipeline over every parcel in a block group and color a map by "ADU-ready," "maybe" or "blocked by rule X." Planners then see *which single rule* blocks the most potential homes, which is a policy finding, not just a pretty map.

## The twist

Most housing tools help people *find* housing. myRealEstateAgent helps people *create* it, one lot at a time. Neighborhood mode also turns thousands of single-lot answers into evidence for zoning reform: "If the county relaxed the rear setback from 10 ft to 5 ft, 1,840 more lots in College Park could hold an ADU."

## Responsible AI

- **The code decides; the AI explains.** Zoning math (setbacks, footprint, size caps) is ordinary code with tests, not model guesses. The model reads imagery and writes explanations.
- **Every claim is cited.** Each rule in the report links to the exact code section. If the agent isn't sure, it says "unverified, confirm with the permitting office" and doesn't guess.
- **No false promises.** The report is labeled clearly as a feasibility estimate, not a permit, legal advice or an appraisal.
- **Privacy.** Only public parcel data is used. No owner names are shown in neighborhood mode, and individual reports aren't stored unless the user saves them.
- **Equity check.** Neighborhood mode tracks whether "ADU-ready" lots cluster in wealthier areas, and flags it when they do, so the tool doesn't quietly add to existing inequities.
- **Accessibility.** Reports at roughly an 8th-grade reading level, an English/Spanish toggle, screen-reader-friendly HTML and a printable version for people who don't use apps.

## Feasibility (what we can build in ~2.5 hours)

**MVP scope:**
- One jurisdiction (College Park / PG County), one zone table, three ADU types
- Address → satellite tile → Gemini vision → footprint check → cost/rent table → plain-language report
- A static map of about 50 pre-run parcels for the neighborhood demo

**Stack (as built):** Next.js 16 + React Three Fiber, a TypeScript rules engine, Gemini agents with function calling (Claude also supported), county GIS + OpenStreetMap data. The original plan to use Gemini vision on satellite tiles is replaced by real building footprints.

**Team split (4 people):**
- **Rules person:** turns the PG County ADU rules into a JSON table with citations (no coding needed)
- **Agent person:** Gemini prompts, vision step, report writer
- **Maps person:** geocoding, parcel lookup, neighborhood map
- **Money person:** cost ranges, financing programs, the AMI rent calculator, and the pitch

## Scale & sustainability

- **Add a city by adding a rules file.** The rules table is the only thing that changes per jurisdiction, so any city can be added with one JSON file.
- **Partners:** county housing departments (lead generation for their ADU programs), Habitat-style nonprofits (finding candidate lots for their build programs), credit unions (ADU construction loans).
- **Business model:** free for homeowners. Municipalities pay for the neighborhood/policy dashboard.

## Demo script (3 minutes)

1. "Meet Ms. Johnson, 71, retired, in College Park. Her property taxes keep going up."
2. Type her (sample) address and watch the agent's steps appear live.
3. The Lot Report (Sample lot A in the prototype): "Yes, a backyard cottage of about 800 sq ft fits. Rough cost: $265k–$405k. Rented at a 50%-of-area-median rent (about $1,870/month vs. $2,200 market), it brings in roughly $16,800 a year after costs." All numbers come from the rules engine using demo assumptions.
4. Switch to neighborhood mode: the map lights up. "One setback rule blocks 38% of possible homes on this block."
5. Close: "We're not finding housing. We're finding *room* for it."

## The app

A 3D College Park you can fly around. Every single-family lot is colored by whether it can hold one more home, and you talk to **one agent at a time**. The active agent walks to your house in 3D and answers using the rules engine's numbers.

```bash
cd plottwist
npm install
npm run dev            # http://localhost:3100
```

**Model.** Copy `.env.local.example` to `.env.local` and set `GEMINI_API_KEY` (a free key from Google AI Studio). The agents then write their answers with Gemini. They try `gemini-flash-lite-latest`, `gemini-3.5-flash`, `gemini-flash-latest` and `gemini-3.5-flash-lite` in that order, skipping any model that is busy, out of quota or slow; `GEMINI_MODEL` puts your pick first. Code runs each agent's usual tools before the model call (a `<briefing>`), so most answers take one model call, and a turn that passes 15 seconds answers with rules only. The free tier allows only a few requests per minute per model; turn on billing for the key before a live demo. `ANTHROPIC_API_KEY` works too (Claude, `CLAUDE_MODEL`). With both set, Gemini wins unless `MYREALESTATEAGENT_LLM=claude`. With no key, or if the API fails mid-demo, every agent falls back to rules-only templates over the same tools. The status pill in the top bar shows which mode is live.

Either way the model only chooses tools and words. Every number (lot size, cottage size, cost, rent, citywide counts) comes from the TypeScript rules engine.

**Deploy (Google Cloud Run).** Live at https://myrealestateagent-mae3p7k6mq-uk.a.run.app (project `project-c6b676c2-2675-48f3-9b3`, region `us-east4`). The Gemini key lives in Secret Manager as `gemini-api-key`; `.gcloudignore` keeps `.env.local` and raw data out of the upload. To ship a change, from `plottwist/`:

```bash
gcloud run deploy myrealestateagent --source . --region us-east4 --allow-unauthenticated --set-secrets GEMINI_API_KEY=gemini-api-key:latest --memory 1Gi
```

Cloud Run builds the Next.js app with Google's buildpacks (`npm start` honours `$PORT`). The data in `public/data/` ships with the app, so the site needs no database. On a new project the build's service account needs `roles/run.builder` once.

### The five agents

| Agent | Role | Tools it may use |
|---|---|---|
| 📐 Mara | Site Surveyor: finds the lot and measures the backyard | `find_home`, `home_report`, `show_on_map` |
| 📜 Theo | Zoning Clerk: rules and citations, and what's still an assumption | `home_report`, `explain_rules` |
| 🔨 Kofi | Builder: cottage vs. garage conversion costs | `home_report`, `cost_estimate` |
| 🔑 Lena | Rent Steward: affordable rent at 50/60/80% of area median income, and payback | `home_report`, `affordability` |
| 🗺️ Ravi | City Planner: citywide counts, rule what-ifs, recolors the map | `city_stats`, `rank_rule_changes`, `street_leaderboard`, `set_map_policy` |

Each agent sees only its own conversation and its own tools. When you switch agents, the new one gets a short handoff note: what the previous agent last told you. Any agent can suggest a handoff, but only you can make one.

### The data pipeline (real data, all of it)

```bash
npm run fetch-data     # County parcels + city boundary, OpenStreetMap buildings + streets -> data/raw (gitignored)
npm run analyze        # Site-scan every single-family home -> public/data/town.json (~4 MB)
npm test               # Engine tests (geometry, rules, citywide invariants)
```

`analyze` does the following:

1. Merges each tax account's platted lots. Many older College Park homes sit on two 25-ft lots.
2. Matches OpenStreetMap footprints to each home.
3. Finds the front lot line (the one nearest a street) and treats corner-lot street sides separately.
4. Rasterizes each lot on a 2-ft grid.
5. Finds the largest cottage rectangle at least 16 ft wide behind the house, for 12 combinations of setback and house gap.

It then applies the rules engine. **Latest run (Nov 6, 2026):**

- 9,242 parcel polygons, 5,877 tax accounts and **4,350 single-family homes** inside the city limits.
- **3,746 homes (86%) could add a backyard home** under current rules plus our assumptions. 106 are almost there, 404 are blocked and 94 need manual review (zones not modeled, or no data).
- 4,314 homes were scanned against real footprints. 13 use a house outline estimated from county living area, and 23 have no data.
- Single rule change with the most effect: shrinking the house gap from 6 ft to 3 ft adds **+107** homes. 3 ft side/rear setbacks add +70, and +10 points of lot coverage adds +63.

### What's real vs. assumed

- **Real:**
  - Parcels, lot sizes, living area, zones and year built (PG County GIS). Owner names and mailing addresses are never downloaded.
  - Footprints and heights (OpenStreetMap).
  - Zone dimensional standards for RR, RSF-95, RSF-65 and RSF-A (Sec. 27-4202).
  - Accessory structure placement and height-based setback (Sec. 27-5200).
  - Maryland HB 1466's 75% cap.
  - HUD FY2026 area median income ($166,100). Fair Market Rents come from a secondary source.
- **Assumed (labeled in the app):**
  - The 6-ft gap from the house.
  - The 1,000 sq ft local size cap. CB-074-2026's adopted numbers are not yet reflected.
  - Construction costs and the 25% operating-cost share.
- **Not modeled:** transit-oriented and other non-residential zones (83 homes), tree canopy, utility easements, slopes and floodplains.

### Layout

| Path | What it is |
|---|---|
| `lib/engine/rules.ts` | Rules engine: zones, state law, verdicts, costs, rents, what-ifs (shared by server and browser) |
| `lib/engine/site.ts` | Site scan: lot rasterization and largest-rectangle search |
| `scripts/fetch-data.mjs`, `scripts/analyze.ts` | Data pipeline |
| `lib/agents/` | Roles and prompts, tools, Gemini and Claude tool loops (`provider.ts` picks one), rules-only fallback |
| `app/api/agents/[role]/route.ts` | One endpoint per agent |
| `components/TownScene.tsx`, `lib/town/geometry.ts` | 3D city (React Three Fiber): merged meshes for ~9k buildings, walking agents |
| `components/App.tsx` | Overlays: search, citywide stats and rule sliders, home card, chat, agent dock |
| `prototype/` | The first zero-dependency prototype (`node prototype/server.js`) |

## Open questions to settle at the event

- Can we get parcel polygons fast enough, or do we hand-pick demo lots?
- Which financing programs are actually open right now? (Ask the panel.)
- Do we want a "match with a renter" feature later, or does that bring in fair-housing complexity we should avoid?
