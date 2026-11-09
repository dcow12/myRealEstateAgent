# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred (the init question went unanswered; confirm or correct): primary users are city planners, housing-department staff and housing nonprofits evaluating "gentle density" across College Park, MD. Secondary: individual homeowners checking whether their own lot could hold an accessory dwelling unit (ADU). Built for the GDG AI for Good 2026 Housing hackathon (College Park), where judges evaluate it live.

## Product Purpose

myRealEstateAgent scans every single-family lot in College Park against real county zoning geometry and Maryland's 2025 ADU law, and shows which lots could hold one more small home, how big, at what rough cost, and at what affordable rent. Planners test rule changes (setbacks, house gap, coverage, size cap, minimum lot) and see the citywide count change. Success: a user can find a lot, understand its verdict and limiting rule, and quantify what a rule change would unlock, in under a minute.

## Positioning

Every number comes from deterministic code over real parcel and footprint data (4,350 homes scanned on a 2 ft grid), not from a model. Language models only choose tools and phrase answers ("the model talks, code decides"). The planner what-if turns thousands of single-lot answers into a policy finding.

## Operating Context

- Desktop browser primarily (planner workstations, a hackathon judging table on a laptop); must also work on phones.
- 3D map of the city (React Three Fiber) is the main canvas; panels overlay it.
- Five specialised agents, talked to one at a time, each with a fixed tool set: site lookup and backyard measurement; zoning rules and citations; construction cost; affordable rent; citywide policy what-ifs. Inferred: agents are identified by function (Site, Zoning, Cost, Rent, Policy); earlier builds used human names.
- Model provider: Gemini (default, with model failover) or Claude; a rules-only mode answers when no key or the API fails.

## Capabilities and Constraints

- Data: Prince George's County GIS parcels, OpenStreetMap buildings and streets, PG zoning Sec. 27-4202 and 27-5200, MD HB 1466 (75% cap), HUD FY2026 AMI ($166,100) and FMR.
- Assumptions that must stay labeled: 6 ft gap from the main house, 1,000 sq ft local size cap, construction cost ranges, 25% operating-cost share. PG County CB-074-2026 adopted numbers not yet reflected.
- Not modeled: transit-oriented and other zones (83 homes), trees, easements, slopes, floodplains.
- Outputs are feasibility estimates, never permits, legal advice or appraisals.
- Owner names, mailing addresses and sale records are never downloaded or shown. Home prices are the county's current assessed value (public SDAT record), labeled as such, never presented as an asking price.
- Home search: by assessed value and straight-line distance or drive time from a named OpenStreetMap place; drive time is a no-traffic estimate on the city street network.
- Voice input (Web Speech) and read-aloud are optional features.

## Brand Commitments

- Name: myRealEstateAgent (renamed from PlotTwist).
- The user asked that the interface read as a mature, production-grade product (references named: Linear, Vercel, Stripe Dashboard, GitHub): no emojis, no glassmorphism, no promotional copy.

## Evidence on Hand

- `public/data/town.json`: real scan output (4,350 homes; 3,746 fit, 106 almost, 404 blocked, 94 need review).
- No users, testimonials, partners, usage metrics or deployments exist. Never invent them, and never show fabricated activity or status.

## Product Principles

1. Code decides, the model explains: every figure on screen traces to the rules engine or source data.
2. Show the limiting rule, not just the verdict.
3. Assumptions are visible wherever they change an answer.
4. One agent at a time, each staying in its lane, with explicit handoffs.
5. The map is a view; it never decides anything.

## Accessibility & Inclusion

Keyboard operable controls, visible focus, WCAG AA contrast, reduced-motion respected, screen-reader labels for map-only information (verdict counts are also given as text).
