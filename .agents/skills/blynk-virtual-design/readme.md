# Blynk Virtual Technologies — Design System

## What this is

A brand kit and component library for **Blynk Virtual Technologies**, built from the brand
material supplied to this project. It contains the colour system sampled directly from the
logo artwork, a type system, spacing/radius/elevation/motion tokens, 22 React UI primitives,
foundation specimen cards, and two reference UI kits.

## Sources given

Three raster logo files, uploaded to `uploads/`:

| File | What it is |
| --- | --- |
| `uploads/Copy of Untitled.png` | The standalone mark (500×500, white background) |
| `uploads/Untitled design (1).png` | Horizontal lockup, black wordmark on white |
| `uploads/Untitled design (3).png` | Horizontal lockup, white wordmark on black (1920×1080 presentation plate) |

No Figma file, no repository, no codebase, no website, no deck, no copy deck, and no font
binaries were supplied. **Everything in this system that goes beyond the three logo files is an
extrapolation from them** — grounded in the artwork's actual colours and geometry, but not
verified against a real Blynk product. Sections below flag each extrapolation.

## Company & product context

What the artwork tells us with confidence: the company is named **Blynk Virtual Technologies**;
it presents itself with a hard, technical, high-contrast identity (pure black plate, single
saturated cyan, no ornament); the mark is an abstract two-block glyph, not a pictogram of
anything literal; and "Technologies" is set as a subordinate qualifier under a two-tone
"BLYNK **VIRTUAL**" wordmark.

What is **assumed** (and needs your confirmation): the products. Nothing was supplied describing
what Blynk Virtual sells. The two UI kits therefore model a plausible B2B technology company —
a marketing site and an operations console — so the tokens and components can be seen working at
screen scale. See "Open questions" at the end.

---

## CONTENT FUNDAMENTALS

Only one piece of real copy exists in the source: the lockup itself. Its structure sets the
casing rules; the rest of the writing system below is a recommendation consistent with that
signal, not observed practice.

**Observed in the source**
- The wordmark is **all caps** with wide tracking (~0.16em). "BLYNK" is bold, "VIRTUAL" is light
  — weight, not colour, carries the emphasis. "TECHNOLOGIES" sits below at a smaller size, light
  weight, same caps and tracking.
- No tagline, no punctuation, no emoji anywhere in the supplied artwork.

**Recommended voice (extrapolated)**
- **Plain, technical, declarative.** State the capability, then the constraint. "Provision,
  monitor and update fleets of connected devices from one console." Not "Unlock the power of
  your connected future."
- **Sentence case everywhere except eyebrows and the lockup.** Headlines: "The connective layer
  for industrial hardware." Buttons: "Request a demo", "Add device", "Save changes" — never
  "REQUEST A DEMO", never Title Case.
- **ALL CAPS only for eyebrows, table headers and the lockup**, always with the brand's wide
  tracking (`--tracking-eyebrow`, `--tracking-caps`).
- **"You" for the reader, "we" sparingly for the company.** "Your operations team already expects
  this." Avoid "our platform empowers" constructions.
- **Verb-first labels.** "Reboot 6 gateways?" not "Confirmation required".
- **Numbers are specific and unrounded.** "412 of 418 devices reporting", "24.8k msg/min",
  "27.4 °C". Vague quantities ("many", "lots of") read as bluffing in an operations context.
- **Errors name the thing and the consequence.** "HAM-04 has not reported for 22 minutes." Not
  "Something went wrong."
- **No emoji. Ever.** The identity is monochrome-plus-one-accent; emoji break it instantly.
  Status is carried by Lucide glyphs and coloured `Badge` dots.
- **Mono type for identifiers.** Device names, IPs, keys, endpoints and readings are set in
  JetBrains Mono so they read as data, not prose.
- **Em dashes and mid-sentence commas over exclamation marks.** The tone is calm. Nothing in this
  brand shouts.

---

## VISUAL FOUNDATIONS

### Colour
- **Two brand colours, both sampled from the artwork**: `#00B4E8` (`--blynk-cyan`, the lower
  block) and `#4CBDE0` (`--blynk-sky`, the upper block). Plus **true black** `#000000`
  (`--blynk-ink`) from the wordmark and the presentation plate.
- The cyan is the *only* saturated colour in the palette. It appears on primary actions, active
  states, data emphasis and links — nowhere else. If a screen has more than ~5% cyan coverage,
  something is over-emphasised.
- Neutrals are **cool-tinted**, not pure grey: they carry a slight blue cast (`#F4F7F9`,
  `#657280`, `#1E252B`) so they sit under the cyan without going muddy. The ramp runs all the way
  to `#000000` because the source uses genuine black, not a soft charcoal.
- Semantic hues (`--success-500 #12A868`, `--warning-500 #E5A21B`, `--danger-500 #E0402F`) are
  chroma-matched to the cyan so they don't out-shout it.
- **No gradients as decoration.** The one exception in this system is a single very low-opacity
  radial cyan bloom behind the ink hero (`rgba(0,180,232,.22)` → transparent), which reads as
  light falling on a dark plate rather than as a gradient. No purple, no blue-to-violet, no
  multi-stop meshes — none of that appears anywhere in the source.

### Type
- **Display / brand: Montserrat** (300 / 600 / 700). Nearest Google Fonts match to the wordmark's
  geometric caps — wide circular bowls, spurred `G`, straight-legged `R`. **Substitution flagged:
  see "Font substitution" below.**
- **UI & body: Manrope** (400 / 500 / 600 / 700). Slightly narrower than the display face, so
  paragraphs stay dense without fighting the headlines.
- **Data & code: JetBrains Mono.**
- Scale is a 1.25 major third off a 16px base: 11 / 12 / 14 / 16 / 18 / 20 / 25 / 31 / 39 / 49 /
  61 / 76. Display sizes get `-0.02em` tracking; caps eyebrows get `+0.14em`.
- Line-height: 1.06 display, 1.22 headings, 1.5 body.

### Layout
- 1240px max content width, 40px page gutters (20px under 768px), 96px vertical section rhythm.
- 4px base spacing grid with a 2px half-step for optical nudges. Control heights are 32 / 40 / 48.
- **Fixed elements**: the marketing site header and the console top bar are sticky; the console's
  ink rail is a fixed full-height column. Nothing else is pinned — no floating chat bubbles, no
  sticky CTA bars.
- Content is left-aligned by default. Centre alignment is reserved for dialogs and empty states.

### Backgrounds
- The brand's hero surface is **flat true black**, exactly as in the supplied presentation plate.
- Product surfaces are near-white (`--surface-page #FAFCFD`) with white cards on top.
- **No photography, no illustration, no pattern and no texture were supplied**, so none are used.
  Where imagery would live, this system leaves a labelled placeholder plate (see
  `ui_kits/website/LogoStrip.jsx`) rather than inventing stock art. If real photography arrives,
  the source's black-plate treatment suggests cool, low-saturation, high-contrast industrial
  imagery — no warm filters, no grain.

### Corners & borders
- Radii are derived from the mark itself: its blocks are rounded at roughly 14% of their edge
  length. That gives 4 / 6 / 10 / 14 / 20 / 28 and a pill. Controls are 10px, cards 14px, modals
  and large blocks 20px.
- Borders are **1px hairlines** at `--border-subtle` (`#E8EDF1`) on light surfaces and
  `rgba(255,255,255,.14)` on ink. 2px is reserved for the active-tab rule and focus emphasis.
- **Cards never use a coloured left border.** Emphasis comes from `tone="brand"` or `tone="inverse"`.

### Shadows & elevation
- Five outer steps, all **cool-tinted** (`rgba(18,23,27,…)`) and all soft — never black, never
  tight. `--shadow-sm` on resting cards, `--shadow-md` on hover, `--shadow-lg` on popovers,
  `--shadow-xl` on modals and toasts.
- One **coloured** shadow exists: `--shadow-brand` (`0 6px 20px rgba(0,180,232,.32)`), used *only*
  on the hovered primary button. It is the system's single moment of glow.
- Inner shadows are essentially unused; `--shadow-inset` exists for a 1px top highlight on filled
  controls if needed.

### Transparency & blur
- Used in exactly two places: **sticky headers** (`--glass-fill` white at 72% with
  `saturate(140%) blur(14px)`) and the **dialog scrim** (`rgba(10,13,16,.62)` with a 3px blur).
- Everywhere else surfaces are opaque. Blur is a depth cue for things that float over content, not
  a decorative finish. There are no frosted cards and no glassmorphism panels.
- Protection: text over the ink hero sits on the flat plate itself, so no protection gradient is
  needed. If text ever lands on imagery, use an opaque ink capsule, not a gradient scrim.

### Motion
- Durations: 80ms instant, **140ms controls**, **220ms surfaces**, 360ms page transitions, 600ms
  loops.
- One easing curve does almost everything: `--ease-standard cubic-bezier(.2,.8,.25,1)`. Entrances
  use `--ease-out cubic-bezier(.16,1,.3,1)`.
- **No bounce, no spring, no overshoot, no parallax, no scroll-jacking.** The brand is precise;
  motion should feel like a mechanism, not a toy.
- Entrances are an 8–10px rise plus a fade. Toasts rise 8px. Dialogs rise 10px and scale from .98.

### Interaction states
- **Hover**: primary buttons deepen `--cyan-500 → --cyan-600`, gain `--shadow-brand`, and lift
  `translateY(-1px)`. Secondary buttons take a `--neutral-50` fill and a stronger border. Ghost
  controls take an 8%-cyan tint. Interactive cards deepen shadow and lift 1px.
- **Press**: colour deepens one more step (`--cyan-700`) and the element scales to `.985`. No
  ripple.
- **Focus**: a 3px `rgba(0,180,232,.38)` ring plus a cyan border. Never removed, never replaced by
  colour alone.
- **Disabled**: 42% opacity, `not-allowed` cursor. Never greyed by re-colouring.
- **Selected**: cyan-50 fill with a cyan-300 border (tags), or a 2px cyan underline (tabs), or a
  cyan-tinted row (nav rail).

---

## ICONOGRAPHY

**No icon set was supplied** — the source is three logo files and nothing else. This system
therefore standardises on **Lucide 0.451**, loaded from CDN
(`https://unpkg.com/lucide@0.451.0/dist/umd/lucide.js`) and wrapped by the `Icon` component.
**This is a flagged substitution** — see below.

- **Style**: outline only, 1.75px stroke on a 20px box (drop to 1.5px above 32px). Lucide's
  geometric, rounded-terminal outline style matches the mark's soft-cornered geometry better than
  a filled or duotone set would.
- **Sizes**: 16px inline with text, 20px default, 24px in navigation, 28–46px for feature marks.
- **Colour**: `currentColor` always, so an icon inherits its context. Feature icons sit in a 46px
  `--cyan-50` plate with a `--cyan-600` glyph.
- **No emoji, ever.** No unicode symbols pressed into service as icons (no `→`, `✓`, `★` in
  running text) — use the equivalent Lucide glyph.
- **No PNG icons, no icon font, no sprite sheet.** Lucide renders inline SVG at runtime.
- Vocabulary used across the kits: `activity, cpu, wifi, shield-check, workflow, bell-ring,
  gauge, layout-dashboard, settings, server, zap, radio, search, plus, power, download,
  check-circle, alert-triangle, octagon-alert, info, chevron-right, chevron-down, x,
  more-horizontal, play, arrow-right, loader`.

### Brand assets in `assets/`

| File | Use |
| --- | --- |
| `blynk-mark.png` | The two-block glyph, trimmed, transparent background |
| `blynk-logo-horizontal.png` | Black wordmark lockup, transparent background — light surfaces |
| `blynk-logo-horizontal-white.png` | White wordmark lockup, transparent background — ink & brand surfaces |
| `blynk-logo-horizontal-onblack.png` | The original flattened black plate, 2528×519 |

All four are **derived from the uploaded files by cropping and background removal only** — nothing
was redrawn. There is **no vector version of the logo** in this system; the brand should supply an
SVG or EPS. Rendering the wordmark in Montserrat is *not* an acceptable substitute for the real
lockup.

---

## ⚠️ Flagged substitutions — please send originals

1. **Fonts.** No font binaries were supplied. The wordmark is a geometric sans; **Montserrat** is
   the nearest Google Fonts match, with **Manrope** chosen for UI text and **JetBrains Mono** for
   data. If Blynk Virtual licenses a specific face (the wordmark could plausibly be Futura,
   Poppins, Century Gothic or a custom cut), please send the files and I will swap them in — the
   change is confined to `tokens/fonts.css` and `tokens/typography.css`.
2. **Icons.** No icon set was supplied; Lucide is a substitution chosen for stroke-weight and
   geometry compatibility.
3. **Logo format.** Raster only. A vector master is needed for print and large-format use.
4. **Product screens.** Both UI kits are labelled extrapolations, not recreations. They exist so
   the tokens can be judged at screen scale.

---

## Index

### Root
| Path | What |
| --- | --- |
| `styles.css` | The single entry point consumers link. `@import` list only. |
| `thumbnail.html` | Homepage tile for this design system. |
| `readme.md` | This file. |
| `SKILL.md` | Agent Skills front-matter so this folder works as a Claude Code skill. |
| `assets/` | Logo artwork (see table above). |
| `tokens/` | `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `motion.css`, `base.css` |
| `guidelines/` | 21 foundation specimen cards (Colors, Type, Spacing, Brand). |

### Components
Grouped under `components/`. Each has a `.jsx`, a `.d.ts` props contract and a `.prompt.md` usage note.

- **`components/brand/`** — `Logo`
- **`components/core/`** — `Icon`, `Button`, `IconButton`, `Badge`, `Tag`, `Card`
- **`components/forms/`** — `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `Switch`
- **`components/navigation/`** — `Tabs`, `SideNav`, `TopBar`
- **`components/feedback/`** — `Alert`, `Toast`, `Tooltip`, `Dialog`, `Spinner`

Because no source defined a component inventory, this is the standard set sized to the brand's
needs. **Intentional additions**, each with a reason:
- `Icon` — a wrapper is required to give the substituted Lucide set one enforced size/stroke.
- `Logo` — prevents anyone re-typesetting the wordmark by hand.
- `Field` — keeps label/hint/error structure consistent across the seven form controls.
- `TopBar` / `SideNav` — needed for the console kit to compose rather than hand-roll chrome.

### UI kits
- **`ui_kits/website/`** — marketing home page: `SiteHeader`, `Hero`, `LogoStrip`, `FeatureGrid`,
  `SiteFooter`. *Extrapolated.*
- **`ui_kits/console/`** — operations console click-through: `Shell`, `OverviewScreen`,
  `DevicesScreen` (with reboot dialog + toast), `SettingsScreen`. *Extrapolated.*

No slide template was supplied, so no sample slides were created.

---

## Open questions for the brand owner

1. What does Blynk Virtual Technologies actually sell? The UI kits are placeholders until this is
   answered.
2. Font files, or the name of the licensed face used in the wordmark.
3. A vector logo master, plus any secondary/stacked/monochrome lockups.
4. Any existing website, app, deck or Figma file — the moment one exists, the UI kits should be
   replaced with real recreations.
5. Is there a tagline?
