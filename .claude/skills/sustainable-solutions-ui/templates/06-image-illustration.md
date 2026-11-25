# Template — Photo / illustration / diagram

```yaml
id: "[asset-id]"
role: "explanatory | photographic | decorative | logo | chart | diagram"
title: "[visual title]"
src: "[approved path]"
width: null
height: null
aspectRatio: "[e.g. 16:9]"
srcset: []
alt: "[information/function; blank only if genuinely decorative]"
longDescription: "[location or null]"
caption: "Figure [N]. [Exact meaning, period, geography and qualification]."
creator: "[person / institute]"
sourceUrl: "[verified URL]"
license: "[verified SPDX/Creative Commons/custom]"
credit: "[display-ready credit from owner]"
permissionRecord: "[internal URL or ticket]"
date: "[YYYY-MM-DD]"
changes: "[crop, edit, adaptation and disclosure]"
```

**Template rendering:** Responsive `<figure><picture>...</picture><figcaption>... source + credit ...</figcaption></figure>`. No title-as-alt duplication; no changing data image colors unless faithfully disclosed and scientifically valid. If decorative, keep it visually subordinate to tools.
