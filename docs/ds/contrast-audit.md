# Contrast audit

Baseline dark tokens are in `src/App.jsx:3760-3777`; light tokens are at `3830-3856`.

## Method

Ratios below use the WCAG relative-luminance formula. The dark `--card-bg` is composited as 3.5% white over `--bg-base: #0a0c12`, approximately `#13151a`. The light `--card-bg` is 90% white over `--bg-base: #eef1f5`, approximately `#fdfefe`.

WCAG targets used by this audit:

- Normal/body text: at least 4.5:1.
- Small 9–11px labels: at least 3:1; 4.5:1 is preferred.

## Current ratios

| Token | Dark value | Dark/card ratio | Light value | Light/card ratio | Assessment |
|---|---:|---:|---:|---:|---|
| `--text-secondary` | `#9aa4b2` | 7.24:1 | `#334155` | 10.25:1 | Pass |
| `--text-muted` | `#626d7d` | 3.48:1 | `#475569` | 7.50:1 | Fails normal text; passes only relaxed small-label threshold |
| `--text-faint` | `#3f4753` | 1.95:1 | `#64748b` | 4.71:1 | Fails dark-theme small labels |

This explains Isis's report that Show/Hide labels and small variable names disappear at low screen brightness: dark-mode `--text-faint` is below even the 3:1 small-text target.

## Ready-to-paste dark-theme correction

```css
--text-secondary: #9aa4b2; /* 7.24:1; retain */
--text-muted: #7f8b9c;     /* approximately 5.28:1; body-safe */
--text-faint: #778395;     /* approximately 4.75:1; small-label-safe */
```

These values preserve the visual hierarchy while lifting the two failing tokens. Verify against the actual browser-composited background because nested translucent surfaces can alter the final ratio.

## Light theme

The current light values pass against the current card surface. Do not darken them blindly; inspect any inline styles that bypass the CSS tokens. The most important fix is the dark theme, which is currently forced on in the root state.

## Scope for implementation

Prioritize:

1. Forecast `k` labels at `App.jsx:11635`.
2. Forecast Show/Hide and section toggles.
3. Small chart legends and captions that use `var(--text-faint)`.
4. Any hard-coded `#334155`/`#3f4753` used as visible text in the same surfaces.

Do not replace every muted color in the application in one unreviewed sweep. Apply the token change plus targeted exceptions, then verify at reduced screen brightness and at 1024/1280/1440px widths.
