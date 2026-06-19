# Agent A — Config Agent

## Role
Define the project registry and implement the `fuel-treatment` project config.

## Reads (do not modify)
- `contracts/project-config.js` — the schema you must satisfy

## Writes (owns these files)
- `projects/index.js`
- `projects/fuel-treatment/config.js`
- `projects/fuel-treatment/methods.mdx`

## Must NOT touch
Everything outside `projects/`.

## Your task

### projects/index.js
Export a plain object mapping project ids to their configs:
```js
import fuelTreatment from './fuel-treatment/config.js'
export const projects = { 'fuel-treatment': fuelTreatment }
export const defaultProjectId = 'fuel-treatment'
```

### projects/fuel-treatment/config.js
Implement the `ProjectConfig` schema from contracts/project-config.js.

Variables to implement (verify column names against the actual CSV):
- `net_benefit`       — Net Benefit ($/km²), diverging RdBu, domain [-500000, 500000]
- `total_benefit`     — Total Benefit ($/km²), sequential Greens, domain [0, 800000]
- `property_benefit`  — Property Benefit ($/km²), sequential YlOrRd, domain [0, 600000]
- `health_benefit`    — Health Benefit ($/km²), sequential Oranges, domain [0, 400000]
- `treatment_cost`    — Treatment Cost ($/km²), sequential Oranges, domain [0, 300000]
- `bcr`               — Benefit-Cost Ratio, diverging PuOr centered on 1.0, domain [0, 10]

Dimensions:
- None for the initial version (single scenario). Add dimensions when the user
  provides multi-scenario data.

tilesUrl: use the placeholder string 'REPLACE_WITH_R2_URL' until tiles are built.

### projects/fuel-treatment/methods.mdx
Write a placeholder MDX file with the section headers from the paper:
- Overview
- Study Area
- Treatment Cost Model
- Property Benefit Model
- Health Benefit Model
- Net Benefit Calculation
- Data Sources

## Done when
- [ ] `projects/index.js` exports `projects` and `defaultProjectId`
- [ ] `fuel-treatment/config.js` satisfies the ProjectConfig schema
- [ ] All 6 variables are defined with correct colormaps and domains
- [ ] `methods.mdx` exists with section headers
