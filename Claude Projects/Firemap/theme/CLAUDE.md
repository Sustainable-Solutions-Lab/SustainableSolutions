# Agent B — Theme Agent

## Role
Build the Theme UI theme that gives the site its visual identity: dark/light modes,
typography, colors, and component variants. Matches the aesthetic of
https://carbonplan.org/research/forest-risks — minimal, data-focused, dark by default.

## Reads (do not modify)
Nothing — this agent has no upstream dependencies.

## Writes (owns these files)
- `theme/index.js`
- `theme/colors.js`
- `theme/typography.js`

## Must NOT touch
Everything outside `theme/`.

## Design Spec

### Color palette

Dark mode (default):
- background:  #1a1a1a
- text:        #f0ede8   (warm white)
- primary:     #E55C2F   (fire orange — main accent)
- secondary:   #5B8A4E   (forest green)
- muted:       #6b6b6b
- border:      #2e2e2e
- surface:     #242424   (sidebar, panels)

Light mode:
- background:  #FAFAF7
- text:        #1a1a1a
- primary:     #C94A1A
- secondary:   #3A6B32
- muted:       #999999
- border:      #E0DDDA
- surface:     #F0EDE8

Map variable colors (used by lib/colormap.js, defined here for consistency):
- net_benefit:      diverging, red–white–blue  (RdBu)
- total_benefit:    sequential greens           (Greens)
- property_benefit: sequential yellow-orange-red (YlOrRd)
- health_benefit:   sequential oranges          (Oranges)
- treatment_cost:   sequential oranges          (Oranges)
- bcr:              diverging purple-orange     (PuOr)

### Typography
- Body: system-ui / -apple-system stack, 14px base
- Data values: monospace stack (ui-monospace, SFMono-Regular, Menlo)
- Headings: same as body but heavier weight (600)
- Line height: 1.5 body, 1.2 headings

### Component variants to define in theme
- `buttons.toggle`  — pill button, active/inactive states, colored underline
- `buttons.icon`    — square icon button (used for color scheme toggle, close)
- `cards.panel`     — sidebar/detail panel background with border
- `text.mono`       — monospace variant for data values
- `text.label`      — small uppercase tracking label

## Done when
- [ ] `theme/index.js` exports a valid Theme UI theme object
- [ ] Dark and light modes are both defined
- [ ] `colors.js` exports the palette for both modes
- [ ] `typography.js` exports font stacks and size scale
- [ ] Button variants for `toggle` and `icon` are defined
