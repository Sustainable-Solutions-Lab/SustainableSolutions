# Template — Figure / plot and figure caption

## Visual stack

```text
FIGURE 1 · COMPARISON
[Descriptive title — what is being compared and where]
[One sentence explaining why it matters]
[Chart with labeled axes, ticks, legend and uncertainties]
[Always-visible key: baseline — solid; alternative – – dashed]
[How to read: plain-language summary, denominator, data scope]
[Table of underlying values] [Download data] [Download image]
Source: [dataset producer], [version], [date]. Method: [link].
Note: [uncertainty definition], [limitations].
```

## Required field list
Figure ID; chart type; exact research question; axes and scale; units; population; time/geography; baseline; scenario definitions; uncertainty form; sample size; missingness; class labels; data table; cross-filter behavior; citation; method; export filename convention, light/dark palette and accessibility state.

## Realistic test cases (synthetic)
- Negative/zero/missing values all present, 30 categories, extreme outlier, long names.
- Identical data at 320px and 1440px; chart must not trim meaningful data or units.
- SVG/CSV export includes source, units, versions, applied filters and expected decimal precision.
- Tooltip appears on focus as well as pointer and is not the only accessible way to get a value.
