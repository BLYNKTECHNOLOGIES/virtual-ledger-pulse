---
name: Blynk brand identity (ERP theme)
description: Blynk cyan/sky palette, Montserrat/Manrope/JetBrains Mono type stack, 14px radius — replaces the old indigo/purple enterprise theme
type: design
---
ERP UI follows the Blynk Virtual Design System:

- Primary = Blynk cyan `193 100% 40%` (light) / `193 100% 50%` (dark); secondary accent = Blynk sky `194 70% 59%`; neutrals are cool-tinted, ink black base in dark mode.
- Type: Montserrat (display/headings, all h1–h4), Manrope (UI/body, `font-sans`), JetBrains Mono (data/KPIs, `.t-mono`). Never Inter.
- Radius `--radius: 0.875rem` (14px); shadows cool-tinted; `shadow-brand` for brand elevation.
- Utilities: `.t-page-title`, `.t-section`, `.t-card-title`, `.t-kpi`, `.t-eyebrow`, `.t-secondary`, `.t-mono`.
- **Forbidden:** the legacy indigo `231 81%` / purple `265 80%` gradients — fully removed from auth, reset-password, register and website visuals. Never reintroduce purple/indigo gradients.
- Heading elements must not hardcode a base color (broke dark auth plates); rely on inherited/`text-*` semantic tokens.
