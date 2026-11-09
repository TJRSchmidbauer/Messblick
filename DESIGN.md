---
name: Physik-Messwerterfassung
description: A Tafelwerk with coloured register tabs. Ink-navy shell, cool paper ground, white work surfaces, one fixed colour and symbol per measuring device.
colors:
  ink-navy: "#12233f"
  ink: "#0f1b2d"
  ink-soft: "#3a4a63"
  paper: "#eef1f5"
  surface: "#ffffff"
  surface-2: "#f5f7fa"
  hairline: "#c5cfdc"
  hairline-strong: "#8d9bb0"
  shell-ink-soft: "#c4d0e6"
  register-yellow: "#f2c230"
  focus-blue: "#1c4fd8"
  danger: "#b42318"
  ok: "#17703a"
  warn: "#9a5b00"
  channel-1-ultramarine: "#2447d6"
  channel-2-orange: "#c2410c"
  channel-3-green: "#15803d"
  channel-4-violet: "#7e22ce"
  dark-paper: "#0b1322"
  dark-surface: "#131f36"
  dark-surface-2: "#1a2a47"
  dark-shell: "#060c18"
  dark-ink: "#e9eef7"
  dark-accent: "#dbe5fb"
  contrast-yellow: "#ffe100"
typography:
  title:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Atkinson Hyperlegible, system-ui, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.2
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
  sm: "6px"
  md: "8px"
  lg: "10px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1.25rem"
components:
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.45rem 1rem"
    height: "44px"
  button-default-hover:
    backgroundColor: "{colors.surface-2}"
  button-primary:
    backgroundColor: "{colors.ink-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0.45rem 1.5rem"
    height: "52px"
  button-recording:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  tab-register:
    backgroundColor: "{colors.shell-ink-soft}"
    textColor: "{colors.shell-ink-soft}"
    rounded: "{rounded.lg}"
    padding: "0.45rem 1.1rem"
    height: "44px"
  tab-register-active:
    backgroundColor: "{colors.register-yellow}"
    textColor: "{colors.ink-navy}"
    padding: "0.75rem 1.1rem 0.45rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.1rem 1.25rem"
  live-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.8rem 1rem 0.7rem"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "40px"
    padding: "0.4rem 0.55rem"
---

# Design System: Physik-Messwerterfassung

## Overview

**Creative North Star: "Das Tafelwerk"**

A formula handbook with coloured register tabs, rebuilt as a measuring tool. Ink-navy carries the header and the primary action, cool paper-grey is the ground, white is the work surface. Every measuring device owns one register colour plus one symbol, and that pair follows the device through overlay, live card, chart line, table column and export. Dense, hairline-ruled, small radii, real blurred shadows.

The register tabs are the navigation: four steps (1 Quelle, 2 Geräte, 3 Messen, 4 Auswertung) hang off the shell like handbook tabs; the active one turns yellow and rises into the work surface. The surface is used from the back row of a classroom (Beamer mode) and by thumb on a phone, so legibility outranks ornament everywhere.

The build rejects the stock tool look: a grey panel, a blue banner, everything on screen at once.

**Key Characteristics:**
- Colour never carries meaning alone; each channel pairs colour with a shape (circle, triangle, square, diamond).
- Three themes (light, dark, high contrast) share one token set; all components read tokens, never literals.
- One primary action per step panel.
- Measurement numbers are monospaced with tabular figures.
- Flat panels with a hairline border and one blurred shadow; no decorative gradients.

## Colors

Navy ink and cool paper, with one yellow reserved for place-finding and four channel hues reserved for devices.

### Primary
- **Ink Navy** (`ink-navy`): header shell, register strip, primary button fill in light theme. In dark theme the accent flips to Pale Ink (`dark-accent`) on the deep navy ground; in high contrast it becomes Signal Yellow (`contrast-yellow`).

### Secondary
- **Register Yellow** (`register-yellow`): fill of the active step tab only; also the focus ring colour inside the register strip and the pointer tip of the brand mark. High-contrast theme swaps it for `contrast-yellow`.

### Tertiary (device channels)
- **Ultramarine** (`channel-1-ultramarine`, circle), **Orange** (`channel-2-orange`, triangle), **Green** (`channel-3-green`, square), **Violet** (`channel-4-violet`, diamond). Lightened variants are defined for dark and contrast themes so each stays above legible contrast on its ground.

### Neutral
- **Paper** (`paper`) page ground; **Surface** (`surface`) panels, cards, dialogs; **Surface 2** (`surface-2`) hover fills, table heads, channel cards.
- **Ink** (`ink`) text; **Ink Soft** (`ink-soft`) secondary text and notes.
- **Hairline** (`hairline`) panel and table borders; **Hairline Strong** (`hairline-strong`) input borders and ghost buttons.
- **Focus Blue** (`focus-blue`): focus ring, selection, active channel card outline.
- State: **Danger** (`danger`, cinnabar) for recording and errors; **OK** (`ok`) and **Warn** (`warn`) for reading confidence and image-quality issues. State colours always sit beside an icon or word.
- Dark and contrast themes redefine every neutral (`dark-paper`, `dark-surface`, `dark-surface-2`, `dark-shell`, `dark-ink`); contrast theme is pure black with pure white hairlines and no shadow.

### Named Rules
**The Register Rule.** Register Yellow appears only on the active step tab (and its focus ring and the brand pointer). Never use it for buttons, highlights, warnings or chart series.

**The Device Colour Rule.** A channel hue identifies one device and nothing else. It tints that device's live card (9% mix), channel header, overlay, chart line and table column. It is never used for status or decoration.

**The Cinnabar Rule.** Danger red marks recording and errors only.

## Typography

**Display Font:** none; the interface has no display face.
**Body Font:** Atkinson Hyperlegible (with system-ui, sans-serif), weights 400 and 700.
**Label/Mono Font:** JetBrains Mono Variable (with ui-monospace, monospace) for measured numbers, step numbers, editable table cells, kbd.

**Character:** Atkinson is a legibility-first face with unmistakable letterforms, right for a screen read from the back of a room. JetBrains Mono gives measured values fixed-width tabular digits so a live reading never jitters.

### Hierarchy
- **Title** (700, 1.75rem, 1.2): app name in the shell only.
- **Headline** (700, 1.4rem, 1.2): panel step headings.
- **Body** (400, 1rem, 1.5): running text; notes at 0.9rem capped at 68ch.
- **Label** (700, 0.9rem): field labels above controls.
- **Live value** (mono 600, clamp 2.6-3.4rem; Beamer clamp 3-6rem; phone 1.8rem, tight -0.02em tracking): the large reading in each live card, unit in a small 1rem regular suffix.
- **Data** (mono, 0.85-0.9rem): table cells, step numerals in tabs, key caps.

### Named Rules
**The Tabular Rule.** Any number that can change or be compared (live values, table cells, output, timestamps) uses tabular figures.

## Layout

Two-column grid at desktop: camera stage left (1.5fr, sticky), step panel right (minmax 360px, 1fr), 1.25rem gap, max width 1500px. Live cards sit above the active panel and are always visible. Spacing is a dense rem rhythm (0.25, 0.5, 0.75, 1.25rem). Touch targets are at least 44px (buttons, tabs), 40px (fields).

At 900px and below the grid collapses to one column: the camera stays sticky at the top (max 34vh), the register becomes a fixed bottom tab bar with four equal tabs (56px, step number above label, yellow top border), and the "next" bar lifts above it.

Beamer mode (a pressed toggle in the shell) raises base type to 1.2rem, enlarges tabs, live values (up to 6rem) and chart height (52vh), widens the page to full width, and hides tips, notes, notices, the next bar and the secondary controls of step 4.

## Elevation & Depth

Hybrid: flat surfaces ruled with 1px hairlines, plus one soft blurred shadow shared by panels, live cards, the stage and dialogs. Depth is otherwise conveyed by tone (white on paper, tinted cards) and by the register tab rising into the panel. High-contrast theme drops shadows entirely and relies on white outlines.

### Shadow Vocabulary
- **Panel shadow** (`0 1px 2px rgb(0 0 0 / .10), 0 6px 18px -6px rgb(0 0 0 / .20)`): light theme. Dark theme uses `0 1px 2px rgb(0 0 0 / .4), 0 8px 22px -8px rgb(0 0 0 / .6)`; contrast uses `none`.
- **Focus ring** (`outline: 3px solid focus-blue; offset 2px`): every keyboard-focusable element.
- **Active channel** (`0 0 0 2px focus-blue`): the channel card currently being calibrated.

### Named Rules
**The One Shadow Rule.** Components share the single theme shadow; do not invent per-component elevations.

## Shapes

Small, engineered radii: 4px (focus ring, kbd), 6px (fields), 8px (buttons, panels, cards, chart wrap), 10px (dialogs and the rounded top corners of register tabs). Borders are 1px hairlines on containers and 1.5px on controls and choice tiles. Channel symbols are crisp geometric solids (circle, triangle, square, diamond), 14px at 16px viewBox. Icons are custom 24px SVGs with one 1.75 stroke, round caps.

## Components

### Buttons
- **Shape:** 8px radius, 44px minimum height, 1.5px ink border, bold label with leading icon.
- **Default:** white fill, ink text and border; hover shifts to Surface 2; press moves 1px down.
- **Primary:** navy fill (accent token), one per step; `big` variant 52px tall at 1.05rem. Hover brightens. In recording state it turns Danger red.
- **Ghost:** Hairline Strong border, regular weight. In the shell, buttons are transparent with a soft-white border; the pressed state (Beamer toggle) inverts to white fill on navy.

### Register tabs (navigation)
Role tablist inside the navy shell. Inactive tabs: 6% white fill, soft-white bold label, mono step numeral at 80% opacity, 10px top corners. Active tab: Register Yellow fill, navy text, taller (padding-top 0.75rem versus 0.45rem plus 0.4rem top margin) so it appears to hang off the work surface; the 0.18s ease-out padding transition is removed under reduced motion. Mobile: fixed bottom bar, flat tabs, yellow 2px top rule.

### Live cards
Per-channel readout: 8px radius, background tinted 9% with the channel hue over Surface, 1.5px border at 55% channel hue. Row 1: symbol plus device name in channel colour (bold). Row 2: the large mono value with small unit. Row 3: confidence line with icon, coloured OK / Warn / Danger. Auto-fit grid, 170px minimum (260px in Beamer).

### Channel cards (step 2)
Surface 2 card with hairline border; header band tinted 10% with channel colour, holding symbol, name and unit inputs and a status (ok / todo) at the right; warning list below with warn-coloured icon lines. The active card gets the 2px focus-blue ring.

### Inputs / Fields
White fill, 1.5px Hairline Strong border, 6px radius, 40px min height; labels above in bold 0.9rem; numeric inputs in JetBrains Mono. Focus uses the global blue ring. Errors are bold danger text, or a 1.5px danger-bordered block with an icon.

### Choice tiles
Source selection tiles (camera, file, demo): 8px, 1.5px border, 120px min height, icon plus bold title plus small description. The selected tile gains an inset ink ring.

### Chart conventions
Scatter chart on a white-to-surface card, 340px high (52vh in Beamer), ink-coloured axes and titles, theme-derived grid. Each series pairs the channel colour with the channel's point shape and a distinct dash (solid, 6-3, 2-3, 10-3-2-3), so black-and-white prints stay readable; lines are drawn only when x is time. Saved comparison runs are faded (translucent fill, 3-4 dash). Low-confidence points (below 0.4) are enlarged and outlined in red. Optional second y axis on the right, optional log axes, wheel / pinch zoom and pan. PNG export is on white with a title, name and date header.

### Dialogs and hints
Dialogs: 10px radius, 1.5px ink border, shared shadow, dark translucent navy backdrop. Hints and notices are surface strips with a Hairline Strong border and an info icon.

## Do's and Don'ts

### Do:
- **Do** pair every channel colour with its symbol wherever a device is identified (card, chart marker, table head, run list).
- **Do** use tokens (`--ink`, `--surface`, `--line`, `--ch1..4`) so all three themes keep working.
- **Do** keep one primary button per step panel and give it 44px or more touch height.
- **Do** set measured numbers in JetBrains Mono with tabular figures.
- **Do** keep content legible in Beamer mode: large live values, minimal chrome.

### Don't:
- **Don't** use Register Yellow for anything but the active step tab.
- **Don't** use channel hues or Danger red for decoration or generic status.
- **Don't** signal state by colour alone; always add an icon, shape or word.
- **Don't** add per-component shadows or hard offset shadows; use the one theme shadow.
- **Don't** introduce glyph or emoji icons; extend the custom SVG set at 1.75 stroke.
- **Don't** put everything on screen at once; steps are shown one at a time.

## Not canonized

Build drift recorded but not made a rule: the chart's low-confidence outline uses a hard-coded `#c92a2a` instead of a theme token, so it does not adapt to the dark or contrast themes; the PNG export hard-codes white and `#0f1b2d`; the register hover/inactive fills use raw `rgb(255 255 255 / .06-.14)` rather than tokens.
