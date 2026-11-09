---
name: myRealEstateAgent
description: A planning workstation over a real 3D city, with ADU verdicts for every single-family lot in College Park, MD.
colors:
  canvas: "#f6f6f7"
  surface: "#ffffff"
  surface-2: "#f4f4f5"
  surface-3: "#ececee"
  hairline: "#e4e4e7"
  hairline-strong: "#d4d4d8"
  ink: "#18181b"
  ink-2: "#52525b"
  ink-3: "#6b6b74"
  cobalt: "#2d5bd8"
  cobalt-hover: "#2449b4"
  cobalt-soft: "#edf1fc"
  on-cobalt: "#ffffff"
  verdict-fits: "#4c9f6e"
  verdict-almost: "#d3a13a"
  verdict-blocked: "#c9604a"
  verdict-review: "#9ca1a9"
  verdict-fits-text: "#2f7a4d"
  verdict-blocked-text: "#a8432f"
  danger: "#b4392b"
  danger-soft: "#fbeeec"
  map-ground: "#eef0ee"
  proposed-unit: "#9fb3ec"
  canvas-dark: "#0b0c0e"
  surface-dark: "#121316"
  surface-2-dark: "#18191d"
  surface-3-dark: "#202227"
  hairline-dark: "#25272c"
  hairline-strong-dark: "#33363c"
  ink-dark: "#ededef"
  ink-2-dark: "#a8a8b0"
  ink-3-dark: "#8b8b94"
  cobalt-dark: "#6e8ff0"
  cobalt-hover-dark: "#8aa5f4"
  cobalt-soft-dark: "#1a2240"
  on-cobalt-dark: "#0b0c0e"
  verdict-fits-text-dark: "#6cc490"
  verdict-blocked-text-dark: "#ec8a74"
  danger-dark: "#f08a7c"
  danger-soft-dark: "#2a1714"
  map-ground-dark: "#101216"
  proposed-unit-dark: "#4a68c9"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.2
  section:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'cv11', 'ss01'"
  body-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.5
  mono:
    fontFamily: "Geist Mono, ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-hover:
    backgroundColor: "{colors.surface-2}"
  button-active:
    backgroundColor: "{colors.surface-3}"
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.on-cobalt}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-hover}"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
  button-sm:
    typography: "{typography.body-sm}"
    padding: "0 8px"
    height: "24px"
  button-icon:
    width: "28px"
    height: "28px"
    padding: "0"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "30px"
  segmented:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.md}"
    padding: "2px"
  segmented-option-on:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "24px"
  tag:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 6px"
    height: "20px"
  mark:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    size: "20px"
  mark-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  mark-lg:
    rounded: "{rounded.md}"
    size: "32px"
  tab:
    textColor: "{colors.ink-2}"
    padding: "0 8px"
    height: "40px"
  tab-selected:
    textColor: "{colors.ink}"
  agent-tag:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 7px 0 3px"
    height: "22px"
  agent-tag-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
  trace:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
---

# Design System: myRealEstateAgent

## Overview

**Creative North Star: "The Planning Workstation"**

myRealEstateAgent is a docked, three-pane instrument over a real 3D city: a fact sidebar on the left, the map in the centre, an agent console on the right, all under a 48px bar. Surfaces are opaque, borders are 1px hairlines, elevation is nearly flat, and density is that of a production tool (13px body, 28px controls). The world is cool zinc neutrals with exactly one chromatic voice, cobalt, plus four muted verdict colours that appear only where they encode a verdict.

The system's claim is that code decides and the model only talks, so its signature is evidentiary: every agent answer carries a monospace tool-call trace that expands to the full arguments. Numbers are tabular, machine names are mono, and the map is a view rather than a decorative backdrop. The product record pins the register (Linear, Vercel, Stripe Dashboard, GitHub): no emojis, no glassmorphism, no promotional copy.

Light and dark themes are equal citizens; the theme is set before paint from `localStorage['myrealestateagent-theme']` so a dark reload never flashes light.

**Key Characteristics:**
- Three docked panes (320px / fluid / 384px) under a 48px bar; no floating cards over the map except the legend and map tools.
- Cool neutral ground, one accent (cobalt), verdict colours as state only.
- Geist for UI, Geist Mono for measurements, counts, tool names and traces.
- 4 / 6 / 8px radii, 1px hairlines, two whisper-weight shadows.
- Agents are square monograms with a one-word function name.
- The expandable tool-call trace is the signature component.

## Colors

A cool zinc neutral ramp carries everything; cobalt marks action and selection; four muted verdict colours carry state.

### Primary
- **Survey Cobalt** (`cobalt`, dark `cobalt-dark`): primary buttons (Send), the selected-tab underline, focus outlines, field focus halo, range and checkbox accents, the pressed read-aloud toggle (on `cobalt-soft`), the boot progress bar, the accent square in the wordmark, the active agent pin's head, and the proposed-cottage outline on the map. Hover deepens to `cobalt-hover`.
- **Proposed Unit** (`proposed-unit`, dark `proposed-unit-dark`): the softened cobalt used for proposed-cottage geometry fills on the map and its legend dot.

### Tertiary (verdict state)
- **Fits Green** (`verdict-fits`): lots that can add a unit; also the "Ready" and model-online status dots. Text-safe variant `verdict-fits-text` for positive deltas.
- **Almost Ochre** (`verdict-almost`): space found but below the 250 sq ft minimum unit.
- **Blocked Brick** (`verdict-blocked`): blocked lots. Text-safe variant `verdict-blocked-text` for negative deltas.
- **Review Gray** (`verdict-review`): lots needing review; also offline and "Needs a lot" states (as a hollow ring).
- **Error Red** (`danger`, `danger-soft`): error turns in the transcript only.

### Neutral
- **Canvas** (`canvas`): app background behind the shell and boot screen.
- **Surface** (`surface`): bar, sidebar, console, menus, legend, buttons, fields.
- **Surface 2 / 3** (`surface-2`, `surface-3`): hover and pressed fills, segmented tracks, tags, marks, traces, notes; `surface-3` for meter tracks and the "You" avatar.
- **Hairline / Hairline Strong** (`hairline`, `hairline-strong`): panel dividers and row rules; control borders and the trace argument rule.
- **Ink / Ink 2 / Ink 3** (`ink`, `ink-2`, `ink-3`): primary text and selected states; secondary text and labels; meta, placeholders, hints and table headers.
- **Map Ground** (`map-ground`): the map pane background, matched to the scene's sky.

### Map scene palette
The 3D scene keeps its own day and night palettes (SKY in `components/TownScene.tsx`), aligned to the UI neutrals:
- Day: background #eef0ee, ground #e9ebe8, roads #ffffff, parcel lines #9aa29c at 40% opacity, city boundary #52525b (dashed), selection outline #18181b, houses #f5f4f1, other buildings #dcdee2, estimated footprints #ebe6dc, agent pin #71717a (active #18181b), proposed unit #9fb3ec.
- Night: background #101216, ground #14161b, roads #23262d, parcel lines #3a3e47, boundary #a1a1aa, selection #ededef, houses #8d8f96, other #5c5f67, estimated #7d786f, pin #8b8b94 (active #ededef), proposed unit #4a68c9.
- Lot fills use the verdict colours (non-single-family `other` #e4e4e7) at 78% opacity by day, 60% by night; building walls are the roof colour at 82% brightness.

### Named Rules
**The One Cobalt Rule.** Cobalt is the only chromatic accent: action, selection, focus and proposed geometry. Nothing else gets a hue.

**The Verdict-Only Rule.** Green, ochre, brick and review gray appear only where they encode a verdict or a live/idle state. They never decorate.

## Typography

**Display Font:** none; the product has no display tier.
**Body Font:** Geist (with ui-sans-serif, system-ui, -apple-system, Segoe UI), stylistic sets `cv11` and `ss01` on.
**Label/Mono Font:** Geist Mono (with ui-monospace, SF Mono, Menlo).

**Character:** One neutral grotesk at small, dense sizes, with its mono sibling for anything a machine produced. Hierarchy comes from weight (400 / 500 / 600) and ink tone, not size jumps; the whole ramp spans 11 to 16px.

### Hierarchy
- **Headline** (600, 16px, 1.3, -0.01em): the selected lot's address.
- **Title** (600, 14px, 1.2): the active agent's name in the console header; the wordmark uses the same size and weight with -0.01em.
- **Section** (600, 13px): sidebar section headings.
- **Body** (400, 13px, 1.5): everything by default; buttons and tabs at 500.
- **Body small** (12px): meta, hints, notes, status, legend, small buttons, segmented options.
- **Label** (500, 11px): table headers, tags, keyboard hints.
- **Mono** (11px, 1.6 in traces; 0.95em inline): tool names, arguments, rule values, deltas, marks.

### Named Rules
**The Machine-Speaks-Mono Rule.** Tool names, arguments, rule values, deltas and agent monograms are set in Geist Mono; human prose is Geist.

**The Tabular Rule.** Every count, share, area and delta uses tabular numerals.

## Layout

A fixed full-viewport grid: a 48px bar spanning three columns, then sidebar (320px), map (fluid, `minmax(0, 1fr)`) and console (384px). Panes scroll internally; the page never scrolls.

- **Below 1240px:** sidebar 288px, console 344px; agent tab monograms and the city breadcrumb drop.
- **Below 900px:** one column: bar, map at 42dvh, a 40px pane switch ("City and lot" / "Agents"), then one pane at a time. The wordmark collapses to its glyph and the legend shrinks to 11px.

Spacing runs on small steps (2, 4, 6, 8, 12, 16px, with 10 and 14 used for section and header insets). Sections pad 14px 16px 16px and divide with hairlines; key-value rows are 112px label columns with 6px vertical padding; table rows are 28px. Map overlays sit 12px from the pane edges.

## Elevation & Depth

Near-flat. Depth is carried by hairline borders and the surface ramp; shadows are whisper-weight and reserved for things that float over other content.

### Shadow Vocabulary
- **Rest lift** (`0 1px 2px rgba(24,24,27,0.06)`; dark `0 1px 2px rgba(0,0,0,0.4)`): map overlay buttons, legend, agent tags, the selected segmented option.
- **Menu lift** (`0 1px 2px rgba(24,24,27,0.06), 0 4px 12px rgba(24,24,27,0.08)`; dark `0 1px 2px rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.35)`): the address results menu only.
- **Focus** (2px cobalt outline, 2px offset); fields instead shift to a cobalt border with a 3px cobalt halo at 18%.

### Named Rules
**The Hairline-First Rule.** Separate with a 1px border before reaching for a shadow; surfaces are opaque.

## Shapes

Three radii: 4px for small things (tags, marks, kbd, segmented options, menu rows), 6px for controls and inline containers (buttons, fields, segmented tracks, traces, notes, agent tags, large marks), 8px for panel-like containers (results menu, empty states). Status dots are 6px circles; verdict dots are 8px squares with 2px corners; meters are 4px bars. The wordmark is a rounded square outline holding a house block and a cobalt lot square.

## Components

### Buttons
- **Shape:** gently squared (6px), 28px tall, 1px strong-hairline border, 500 weight.
- **Default:** surface fill, ink text; hover to surface-2, pressed to surface-3.
- **Primary:** cobalt fill and border, white text (near-black in dark); hover cobalt-hover. Used for Send.
- **Ghost:** transparent, ink-2 text; hover surface-2 with ink text. Used for theme, clear, reset, mic and voice; a pressed ghost toggle turns cobalt on cobalt-soft.
- **Small / Icon:** 24px tall with 12px text; icon buttons are 28px square.
- **Disabled:** 50% opacity, not-allowed cursor. Transitions are 120ms on background, border and colour.

### Chips
- **Tag:** 20px, surface-2 fill, hairline border, 4px corners, 11px/500 ink-2. Agent capability tags switch to mono.
- **Segmented control:** surface-2 track with 2px padding; the pressed option becomes a surface pill with rest lift.

### Cards / Containers
- **Corner Style:** 6px inline (notes, handoff, needs-lot, trace), 8px for menus and empty states.
- **Background:** surface-2 for inline notices; surface for menus. Empty states use a dashed strong hairline.
- **Internal Padding:** 8px 10px for notices, 12px for empty states.

### Inputs / Fields
- **Style:** 30px, 1px strong hairline, 6px corners, surface fill, leading icon in ink-3, placeholder ink-3. The composer is a 36px field holding mic, voice and Send.
- **Focus:** border turns cobalt with a 3px cobalt halo at 18%.
- **Range / Checkbox:** native controls tinted cobalt.

### Navigation
- **Agent tabs:** 40px text tabs, 500 weight, ink-2 to ink on hover; the selected tab gets ink text, a filled ink monogram and a 2px cobalt underline inset 6px.
- **Mobile pane switch:** the same tab style, two equal tabs.
- **Disclosure:** a 600-weight heading button whose chevron rotates 90deg in 120ms when expanded.

### Agent identity
Five agents, each a square monogram plus a one-word function name: Site (S), Zoning (Z), Cost (C), Rent (R), Policy (P). The monogram is a 20px mono letter on a 4px-cornered surface-2 square (32px with 6px corners in the console header, 18px in tabs, 16px in map tags and ask buttons). The active agent's mark inverts to ink fill with surface text, everywhere at once: tab, header, map tag. On the map each agent is a pin (thin post, cube head, ground ring); the active pin darkens, its head turns cobalt and its ring widens. A floating agent tag (22px, mark plus name) tracks each pin and inverts when active. Agents that need a lot show a hollow review-gray ring and "Needs a lot".

### Tool-call trace (signature)
Under each agent answer, a surface-2 block in 11px Geist Mono lists every tool call: a CSS caret, the tool name in ink, the arguments truncated in ink-3, and a right-aligned "pre-run" marker when applicable. Each call is a native disclosure; opening it rotates the caret 90deg (120ms), hides the inline arguments and shows the full arguments as wrapped mono under a 1px strong-hairline rule, indented 12px. The tool name underlines on hover.

### Motion
State transitions are 120ms on `cubic-bezier(0.2, 0, 0, 1)`; meter widths animate in 200ms. Loading uses a 0.9s linear spinner and a 1.1s indeterminate bar. The camera eases with damping 0.12; agent pins travel at a fixed ground speed. Under `prefers-reduced-motion`, all CSS animation and transition durations collapse to 0.01ms.

## Do's and Don'ts

### Do:
- **Do** keep cobalt to action, selection, focus and proposed geometry (The One Cobalt Rule).
- **Do** pair every verdict colour with its text label; dots and meters are never the only carrier.
- **Do** set machine output (tool names, arguments, rule values, deltas) in Geist Mono with tabular numerals.
- **Do** show the tool-call trace under every agent answer that called tools.
- **Do** identify agents only by square monogram plus one-word function name.
- **Do** separate with 1px hairlines and keep surfaces opaque; use rest lift only for elements floating over the map or another surface.
- **Do** define every new colour for both themes.

### Don't:
- **Don't** use emojis, glassmorphism or promotional copy (product brand commitment).
- **Don't** introduce a second accent hue or use verdict colours decoratively.
- **Don't** give agents human names, faces or mascots.
- **Don't** float cards over the map beyond the legend and map tools; panels dock.
- **Don't** add uppercase eyebrows or kicker labels above headings; sections are titled by plain 13px/600 headings.
- **Don't** exceed the 16px top of the type ramp inside the workstation.
