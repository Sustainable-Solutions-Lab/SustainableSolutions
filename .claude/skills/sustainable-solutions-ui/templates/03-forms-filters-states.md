# Template — Input panel, filters and complete application states

## Input field schema

| Field | Value type | Unit | Valid bounds | Default | Helpful example | Error |
|---|---|---|---|---|---|---|
| Region | controlled select | n/a | [study regions] | [all/verified default] | [named region] | Region unavailable |
| Year | integer | year | [dataset time span] | [latest year] | 2035 (SAMPLE) | Outside supported range |
| Scenario | enumerated | n/a | baseline/alternative | baseline | [explanation] | Unsupported scenario |
| Threshold | decimal | [unit] | [min,max] | [verified value] | [sample] | Use a value between [min]–[max] |

## State copy contracts

| State | UI message pattern | Action |
|---|---|---|
| Idle | “Choose a region and scenario to explore results.” | Run / show defaults |
| Loading | “Calculating [scenario] for [region]…” | Can cancel; preserve prior verified result labeled previous |
| Ready | “[Metric + units] for [region], [time].” | View plot, table, export |
| Empty | “No records meet these filters.” | Clear filters |
| Invalid | “Year must be between [a] and [b].” | Fix input; focus error |
| Partial | “Some regions could not be loaded.” | View loaded regions / retry |
| Stale | “Using dataset [version] from [date]; refresh failed.” | Retry / see version |
| Timeout | “Results took too long to load.” | Retry / simplify filters |
| Offline | “Cannot fetch live data. Previously downloaded data may still be available.” | Retry |
| Export success | “Data exported with filters and citation information.” | Access file |
| Export failure | “Could not create this export.” | Retry / alternative format |

Do not present a success toast before operation completes; preserve screen-reader live region. Tooltips should never be the only location of essential units or guidance.
