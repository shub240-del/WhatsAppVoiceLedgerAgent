# Udhaar — Design System

**Status:** Initial design baseline | **Updated:** 2026-11-09

## 1. Brand character
Trustworthy, calm, practical and human. Built for everyday Indian shop owners. Modern without looking like a generic enterprise dashboard. Financial values and transaction status must be easy to scan.

Core idea: **Your voice. Your khata.**

## 2. Colour tokens
Starting tokens; inspect the existing logo/CSS before replacing current values.

| Token | Value | Use |
|---|---|---|
| `brand-forest` | `#365B49` | Primary CTA, logo, active nav |
| `brand-forest-dark` | `#263B30` | Headings, high-emphasis text |
| `brand-sage` | `#758866` | Secondary accents |
| `surface-warm` | `#F8F9F4` | Main background |
| `surface-white` | `#FFFFFF` | Cards/forms |
| `surface-sage` | `#EEF2E6` | Highlight panels |
| `border-soft` | `#E2E7DC` | Borders |
| `text-primary` | `#28372E` | Main text |
| `text-secondary` | `#7C897F` | Supporting text |
| `success` | `#27845B` | Recorded/confirmed |
| `warning` | `#B7832F` | Pending attention |
| `danger` | `#C65B58` | Error/rejected |
| `info` | `#547DB5` | Informational |

Pair colour with text/icons; never rely on colour alone.

## 3. Typography
- Keep the existing readable sans-serif if already bundled.
- Use bold/medium sans-serif for UI and headings.
- Use restrained italic serif for the marketing hero accent (e.g. “More dukaan.”).
- Use tabular numerals for balances and amounts.
- Avoid adding fonts/dependencies without checking bundle impact and licensing.

Suggested hierarchy: hero headline large/responsive; section headings clear; dashboard title 28–36px desktop; body 15–17px; captions 12–13px with adequate contrast.

## 4. Layout
Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80px.
Breakpoints to verify: 360, 390, 768, 1280, 1440px.
Use generous marketing whitespace, consistent card padding, subtle borders/shadows and readable form labels. Mobile layouts stack columns and avoid horizontal overflow.

## 5. Component rules
- Primary button: forest background, white text, hover/focus/disabled states.
- Secondary button: light surface, forest border/text.
- Destructive action: danger treatment plus confirmation.
- Touch targets: aim for at least 44×44px.
- Inputs: persistent labels, visible focus, inline errors, explicit ₹ amount semantics.
- Ledger rows: customer, type, amount, timestamp and status; align money consistently.
- Reversed entries remain visible and clearly labelled.
- Empty/loading/error states must be explicit.
- Never show “₹0” when data is unavailable; show loading/error instead.

## 6. Marketing landing page reference
Preserve the established design:
- Warm off-white background.
- Forest-green Udhaar wordmark.
- Minimal top navigation.
- Two-column hero.
- “Less hisaab. More dukaan.” headline with bold sans-serif plus italic serif accent.
- Product demonstration on the right.
- Strong primary CTA and quieter demo CTA.
- Small trust cues beneath CTA.

Do not replace with a generic gradient-heavy SaaS template. Marketing claims must match verified capabilities.

## 7. WhatsApp-style hero demonstration
A frontend-built, illustrative conversation may show:
1. Owner voice note.
2. Transcript.
3. Assistant response.
4. Ledger confirmation.
5. Owner reply.

Use WhatsApp-inspired layout without WhatsApp logo or implied endorsement. Use CSS/components, not a flat screenshot. Label all customer names/balances as demo data. No real API request or transaction. Animation should be restrained and respect `prefers-reduced-motion`.

Illustrative example only:
- Ramesh
- Credit added ₹340
- Previous balance ₹920
- New outstanding ₹1,260

## 8. Owner dashboard
Keep forest-green/warm off-white identity, white cards, clear overview metrics and readable customer/ledger rows. Avoid clutter, meaningless charts, fake data, low-contrast text and dead buttons.

## 9. Accessibility
Semantic landmarks/headings, keyboard operation, visible focus, sufficient contrast, accessible icon labels, errors associated with inputs, reduced-motion support and no hover-only functionality.

## 10. Design acceptance
- [ ] Brand colours and typography consistent.
- [ ] Desktop/mobile reviewed at target widths.
- [ ] No 360px horizontal overflow.
- [ ] Buttons expose all states.
- [ ] Forms have labels and validation.
- [ ] Amounts use tabular numerals.
- [ ] Empty/loading/error states explicit.
- [ ] Reversed entries remain visible.
- [ ] Demo content clearly illustrative.
- [ ] No unsupported marketing claims.
