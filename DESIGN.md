---
name: Messblick
description: A Tafelwerk with register tabs in the owner's schmidbauer.io brand. Apricot shell, Kohle ink, Creme paper, flat and calm, one fixed colour and symbol per measuring device.
colors:
  apricot: "#f6b48f"
  apricot-light: "#fad2b8"
  kohle: "#2e2a28"
  creme: "#fbf4ec"
  ziegelrot: "#e8836b"
  link-sienna: "#a0502c"
  pfirsich: "#fde3d0"
  sand: "#f1e1cf"
  surface: "#ffffff"
  ink-soft: "#5a5350"
  line: "#e0d2c4"
  line-strong: "#8a7f78"
  danger: "#b3341f"
  ok: "#2f6b3c"
  warn: "#8a4b00"
  channel-1-brick: "#c4472d"
  channel-2-teal: "#2e6f8e"
  channel-3-olive: "#5b7f2b"
  channel-4-plum: "#8a4f9e"
  dark-paper: "#2e2a28"
  dark-surface: "#3a3532"
  dark-surface-2: "#45403c"
  dark-shell: "#211e1c"
  dark-ink-soft: "#d9ccc0"
  dark-line: "#57504b"
  contrast-black: "#000000"
  contrast-white: "#ffffff"
typography:
  wordmark:
    fontFamily: "Space Grotesk, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Space Grotesk, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.9rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Space Grotesk, Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    lineHeight: 1.5
  live-value:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "clamp(2.6rem, 3.2vw, 3.4rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  data:
    fontFamily: "JetBrains Mono Variable, monospace"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: "4px"
  sm: "8px"
  field: "10px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1.25rem"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.kohle}"
    rounded: "{rounded.pill}"
    padding: "0.45rem 1.1rem"
    height: "44px"
  button-default-hover:
    backgroundColor: "{colors.pfirsich}"
  button-primary:
    backgroundColor: "{colors.kohle}"
    textColor: "{colors.creme}"
    rounded: "{rounded.pill}"
    padding: "0.45rem 1.5rem"
    height: "52px"
  button-recording:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
  button-shell:
    backgroundColor: "{colors.apricot}"
    textColor: "{colors.kohle}"
    rounded: "{rounded.pill}"
    height: "44px"
  tab-register:
    backgroundColor: "{colors.apricot-light}"
    textColor: "{colors.kohle}"
    rounded: "{rounded.md}"
    padding: "0.45rem 1.1rem"
    height: "44px"
  tab-register-active:
    backgroundColor: "{colors.kohle}"
    textColor: "{colors.creme}"
    padding: "0.75rem 1.1rem 0.45rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.kohle}"
    rounded: "{rounded.lg}"
    padding: "1.25rem 1.4rem"
  live-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.kohle}"
    rounded: "{rounded.lg}"
    padding: "0.8rem 1rem 0.7rem"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.kohle}"
    rounded: "{rounded.field}"
    height: "40px"
    padding: "0.4rem 0.6rem"
---

# Design System: Messblick

## Overview

**Creative North Star: "Das Tafelwerk"**

A formula handbook with register tabs, rebuilt as a measuring tool and dressed in the owner's schmidbauer.io brand. Apricot carries the shell and the tab strip, Kohle carries ink, the primary action and the active tab, Creme is the ground, white the work surface. Every measuring device owns one channel colour plus one symbol, and that pair follows the device through overlay, live card, chart line, table column and export. Flat, calm, pill-shaped controls, 16px panels.

The register tabs are the navigation: four steps (1 Quelle, 2 Geräte, 3 Messen, 4 Auswertung) hang off the Apricot shell; the active one turns Kohle and rises into the work surface. The tool is read from the back row of a classroom (Beamer mode) and used by thumb on a phone, so legibility outranks ornament everywhere.

**Key Characteristics:**
- Flat: borders and tone do all the work; no shadows, no gradients.
- Colour never carries meaning alone; each channel pairs colour with a shape (circle, triangle, square, diamond).
- Three themes (light, dark, high contrast) share one token set; components read tokens, not literals.
- One primary action per step panel.
- Space Grotesk for headings, Atkinson Hyperlegible for text, JetBrains Mono for measured numbers; all self-hosted via @fontsource, no external requests.

## Colors

Warm apricot and charcoal on cream, with four channel hues reserved for devices.

### Primary
- **Kohle** (`kohle`): ink, primary button fill, active tab fill, dialog and control borders. In the dark theme the accent flips to Apricot on a Kohle ground; in high contrast it is Apricot on black.

### Secondary
- **Apricot** (`apricot`): header shell and tab strip background, selection, calibration-point halo on the camera image. Inactive tabs use Apricot Light (`apricot-light`).
- **Ziegelrot** (`ziegelrot`): the dot of the wordmark and of the footer slogan only.

### Tertiary (device channels)
- **Brick** (`channel-1-brick`, circle), **Teal** (`channel-2-teal`, triangle), **Olive** (`channel-3-olive`, square), **Plum** (`channel-4-plum`, diamond). Lightened variants exist for dark (`#ff9e80 #7cc4e4 #b5d96b #d9a6ea`) and contrast (`#ff8a6b #66c8ff #a6f04d #f29bff`) so each stays legible on its ground.

### Neutral
- **Creme** (`creme`) page ground; **Surface** (`surface`) panels, cards, dialogs; **Pfirsich** (`pfirsich`) hover fills, hint strips, channel cards, table heads; **Sand** (`sand`) tertiary tint.
- **Ink Soft** (`ink-soft`) secondary text and notes; **Line** (`line`) panel and table borders; **Line Strong** (`line-strong`) input borders and ghost buttons.
- **Link Sienna** (`link-sienna`): links and the focus ring in the light theme (Apricot in dark and contrast).
- State: **Danger** (`danger`) for recording and errors; **OK** (`ok`) and **Warn** (`warn`) for reading confidence and image-quality issues. State colours always sit beside an icon or word.
- Dark theme: `dark-paper`, `dark-surface`, `dark-surface-2`, `dark-shell`, Creme ink, `dark-line`. Contrast theme is pure black with pure white lines.

### Named Rules
**The Brand Rule.** The surface is flat and calm: no shadows, no gradients, anywhere, in any theme. Hierarchy comes from tone, 1.5px borders and shape. Apricot, Kohle and Creme are the owner's brand values; do not substitute or tint them.

**The Ziegel Rule.** Ziegelrot appears only on the wordmark dot and slogan dots. Never use it for buttons, warnings or series.

**The Device Colour Rule.** A channel hue identifies one device and nothing else. It tints that device's live card (9% mix), channel header, overlay, chart line and table column. It is never used for status or decoration.

**The Danger Rule.** Danger red marks recording and errors only.

## Typography

**Display Font:** Space Grotesk (with Atkinson Hyperlegible, system-ui, sans-serif), 500 and 700; wordmark, h1-h3, live-card device names, footer slogan.
**Body Font:** Atkinson Hyperlegible (with system-ui, sans-serif), 400 and 700.
**Label/Mono Font:** JetBrains Mono Variable (with ui-monospace, monospace) for measured numbers, step numerals, editable table cells, kbd.

**Character:** Space Grotesk gives headings a quiet technical voice; Atkinson is a legibility-first face for a screen read from the back of a room; JetBrains Mono gives readings fixed-width tabular digits so a live value never jitters.

### Hierarchy
- **Wordmark** (700, 2.1rem, -0.04em): the "ts." mark in the shell, Ziegelrot dot.
- **Title** (700, 1.9rem, 1.1): app name in the shell, set off by a 2px left rule.
- **Headline** (700, 1.4rem, 1.2): panel step headings.
- **Body** (400, 1rem, 1.5): running text; notes at 0.9rem capped at 68ch.
- **Label** (700, 0.9rem): field labels above controls.
- **Live value** (mono 600, clamp 2.6-3.4rem; Beamer clamp 3-6rem; phone 1.8rem): the large reading in each live card, unit in a 1rem regular suffix.
- **Data** (mono, 0.85-0.9rem): table cells, step numerals in tabs, key caps.

### Named Rules
**The Tabular Rule.** Any number that can change or be compared (live values, table cells, output, timestamps) is set in JetBrains Mono with tabular figures.

## Layout

Two-column grid at desktop: camera stage left (1.5fr, sticky), step panel right (minmax 360px, 1fr), 1.25rem gap, max width 1500px. Live cards sit above the active panel and are always visible. Spacing is a dense rem rhythm (0.25, 0.5, 0.75, 1.25rem). Touch targets are at least 44px (buttons, tabs), 40px (fields).

At 900px and below the grid collapses to one column: the camera stays sticky at the top (max 34vh), the register becomes a fixed bottom tab bar with four equal flat tabs (56px, step number above label, 2px top rule), and the "next" bar lifts above it.

Beamer mode (a pressed toggle in the shell) raises base type to 1.2rem, enlarges tabs, live values (up to 6rem) and chart height (52vh), widens the page to full width, and hides tips, notes, notices, the next bar and the secondary controls of step 4.

## Elevation & Depth

Flat. No surface casts a shadow. Depth is conveyed by tone (white panels on Creme, Pfirsich tints on white), 1.5px borders, and the active register tab rising into the panel by growing taller. The only interaction feedback is tone shift and a 1px press translate; focus is a 3px outline.

### Named Rules
**The Flat Rule.** See The Brand Rule: shadows and gradients are never introduced; use a border or a tone step instead.

## Shapes

Pill buttons (999px) and pill shell selects; 16px panels, live cards, dialogs, camera frame; 12px channel cards, hints, chart wrap and the top corners of register tabs; 10px fields; 8px small blocks (error blocks, notices, export fieldset); 4px focus corners and kbd. Borders are 1.5px on controls, panels and cards, 1px on tables and dividers. Channel symbols are crisp geometric solids (circle, triangle, square, diamond). Icons are custom SVGs in one stroke weight, round caps.

## Components

### Buttons
- **Shape:** pill (999px), 44px minimum height, 1.5px Kohle border, bold label with leading icon.
- **Default:** white fill, Kohle text and border; hover shifts to Pfirsich; press moves 1px down.
- **Primary:** Kohle fill, Creme text, one per step; `big` variant 52px at 1.05rem. In recording state it turns Danger red.
- **Ghost:** Line Strong border, regular weight.
- **In the shell:** transparent with a Kohle border; hover fills Creme; pressed (Beamer toggle) inverts to Kohle fill on Apricot.

### Register tabs (navigation)
Tablist inside the Apricot shell, under a 1.5px Kohle rule. Inactive tabs: Apricot Light fill, Kohle bold label, mono step numeral at 80% opacity, 12px top corners; hover Creme. Active tab: Kohle fill, Creme text, taller so it hangs into the work surface; the 0.18s ease-out padding transition is removed under reduced motion. Mobile: fixed bottom bar, flat tabs.

### Live cards
Per-channel readout: 16px radius, background tinted 9% with the channel hue over Surface, 1.5px border at 55% channel hue. Row 1: symbol plus device name in channel colour (Space Grotesk bold). Row 2: the large mono value with small unit. Row 3: confidence line with icon, coloured OK / Warn / Danger. Auto-fit grid, 170px minimum (260px in Beamer).

### Channel cards (step 2)
Pfirsich card with 1.5px Line border, 12px radius; header band tinted 10% with channel colour, holding symbol, name and unit inputs and a status at the right; warning list below. The active card gets a 2px inset Kohle outline.

### Inputs / Fields
White fill, 1.5px Line Strong border, 10px radius, 40px min height; labels above in bold 0.9rem; numeric inputs in JetBrains Mono. Focus uses the global 3px focus outline (Link Sienna / Apricot). Errors are bold danger text or a 1.5px danger-bordered block with an icon.

### Choice tiles
Source tiles (camera, file, demo): 8px radius, 1.5px border, 120px min height, icon plus bold title plus small description. Selected tile gains a Kohle inset outline.

### Chart conventions
Scatter chart on a white card with 12px radius, 340px high (52vh in Beamer), Kohle axes and titles, Line-coloured grid. Each series pairs the channel colour with its point shape and a distinct dash (solid, 6-3, 2-3, 10-3-2-3) so black-and-white prints stay readable; lines are drawn only when x is time. Saved comparison runs are faded. Low-confidence points are enlarged and outlined. Optional second y axis, log axes, wheel / pinch zoom and pan. PNG export is on white with a title, name and date header.

### Dialogs and hints
Dialogs: 16px radius, 1.5px Kohle border, flat, dark translucent backdrop. Hints are Pfirsich strips without border; notices are surface strips with a Line Strong border.

## Do's and Don'ts

### Do:
- **Do** keep every surface flat; separate with a 1.5px border or a tone step (Creme, white, Pfirsich).
- **Do** pair every channel colour with its symbol wherever a device is identified (card, chart marker, table head, run list).
- **Do** use tokens (`--ink`, `--surface`, `--line`, `--accent`, `--shell`, `--ch1..4`) so all three themes keep working.
- **Do** keep one primary button per step panel and give it 44px or more touch height; use pill shape for all buttons.
- **Do** set headings in Space Grotesk, text in Atkinson Hyperlegible and measured numbers in JetBrains Mono with tabular figures; keep fonts self-hosted.
- **Do** keep content legible in Beamer mode: large live values, minimal chrome.

### Don't:
- **Don't** add box-shadows, text-shadows, glows or gradients.
- **Don't** use Ziegelrot beyond the wordmark dot and slogan dots.
- **Don't** use channel hues or Danger red for decoration or generic status.
- **Don't** signal state by colour alone; always add an icon, shape or word.
- **Don't** introduce glyph or emoji icons; extend the custom SVG set.
- **Don't** load fonts or assets from external hosts.
- **Don't** put everything on screen at once; steps are shown one at a time.

## Not canonized

Build drift recorded but not made a rule: hard-coded literals outside the token set (chart and camera overlay use `#2e2a28`, `#f6b48f`, `#f6b48f` halos and a fixed LIGHT palette in `src/main.ts`/`src/ui/chart.ts`; PNG export fixed to light); the camera frame is `#000`; the dialog backdrop is still a navy-tinted `rgb(5 10 20 / .6)` left over from the old palette; `button.primary:hover` uses `filter: brightness(1.12)`; the `.nextbar` bottom corners use 8px and `.chan.active` and `.choice.active` use a 2px outline ring rather than a named token.
