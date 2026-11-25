# Template — Data download manifest

The export should include `dataset.csv` (or GeoJSON), `README.md` and/or `metadata.json` documenting exact query context. All values below are placeholders.

```json
{
  "title": "[Tool / export name]",
  "generatedAtUTC": "[ISO 8601]",
  "toolVersion": "[semver or git commit]",
  "modelVersion": "[release / hash]",
  "dataset": {"title": "[name]", "producer": "[organization]", "version": "[version]", "published": "[YYYY-MM-DD]", "doi": "[verified URL]", "license": "[verified license]"},
  "filters": {"region": "[area]", "scenario": "[id]", "dateRange": "[start/end]"},
  "methodUrl": "[verified link]",
  "units": {"outcome": "[unit]"},
  "uncertainty": "[interval definition]",
  "missingValues": "[encoding and suppression]",
  "coordinateReferenceSystem": "[CRS or null]",
  "paperCitation": "[verified citation or null]",
  "attributions": ["[required source credits]"],
  "limitations": ["[known caveats]"]
}
```

For CSV exports, maintain machine-readable numeric precision and UTF-8; prevent spreadsheet formula injection from untrusted string fields; don't prepend pretty-formatted units inside numeric cells. Sensitive user inputs should not leak into public share URLs.
