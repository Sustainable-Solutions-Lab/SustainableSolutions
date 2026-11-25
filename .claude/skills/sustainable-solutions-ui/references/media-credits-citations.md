# Images, video, animation, media rights, citations, footnotes & credits

## Universal provenance rule

No content is 'just decorative' if its source, licensing or scientific interpretation matters. Every published research page must supply verifiable attribution and version information; content authors must differentiate a data citation, paper citation, software citation, base-map credit and media credit. Never invent authors, journals, DOIs, citations, dataset years, credit lines or licenses.

## Images / photography / illustrations

- Specify role: explanatory diagram, photograph, map export, figure thumbnail, visual metaphor, logo or purely decorative background. Keep research figures faithful; do not AI-enhance charts or relabel data silently.
- Required content record: asset ID; owner; file and source URL; creator; rights/permission/license; requested credit; date; alt; long description for complex figures; caption; image dimensions/ratio; crop focal point; dark-mode behavior; expiration/embargo; export use.
- Avoid downloading remote third-party assets without documented permission. Use approved lab/university logo assets, never hand-traced or recolored seals/wordmarks.
- Use SVG for icons/diagrams with sanitization; AVIF/WebP/picture fallback for photographs; prevent CLS via dimensions/aspect ratio, responsive srcset/sizes, lazy loading except leading image.
- Write concise alt describing *information/function*, not generic pixels; empty `alt=""` only for truly decorative images. Graphically dense figures need extended text/table accessible nearby.
- Caption template: `Figure N. [What the image shows and under which conditions]. Source: [author/publisher, year]. [Adapted/reproduced with permission; license].`

## Video, audio and animated content

- Provide visible title, short purpose/description, provider/source, presenter/creator and credits, upload/review date, duration, license, captions, transcript, and audio description where needed (Stanford guidance explicitly references captions and audio descriptions for new video).
- No autoplay with sound; avoid autoplay movement unless justified and reduced-motion alternative exists. Provide controls and keyboard support; avoid inaccessible custom playback chrome.
- Poster image needs alt/caption; use privacy-aware video embeds or consent-gated third-party embeds where necessary. Include plain external link and fallback if embed fails or is blocked.
- Time-coded chapters optional; transcripts must identify speakers and meaningful sounds. No critical instruction should exist in video alone.
- Animations should have play/pause, progress, rate or frame-step when scientifically meaningful; explain the timeline and sampling/resolution, and supply static/table equivalent.
- Media credit template: `[Media title], [creator/presenter], [organization], [year], [platform/URL], [license or used by permission], [accessed date if volatile].`

## Scholarly references and data citation

**Preferred data model:** one normalized registry of citable references keyed by stable ID, reused by inline citations, figure captions, source notes, download README and bibliography. Group by reference type while preserving a common display system.

```json
{
  "id": "ref-example-paper",
  "kind": "journal-article",
  "title": "[Verified paper title]",
  "authors": ["[Name]"],
  "year": null,
  "journal": null,
  "volume": null,
  "pages": null,
  "doi": null,
  "status": "in-review",
  "url": null,
  "accessed": null,
  "verified": false
}
```

- Journal paper: authors, year, exact title, journal/venue, volume/pages if assigned, DOI as persistent HTTPS link, publication status (never invent published bibliographic fields for a preprint).
- Dataset: producer, title, version, repository, DOI/landing URL, publication/release date, license, data coverage and access date when appropriate.
- Software/model: authors/organization, project, version/commit, repository, archival DOI if present, license, accessed date, dependencies as needed.
- Map tile/imagery: provider, applicable copyright statement, data contributors, map style authors, exact required attribution text and clickable links; credit persists when screenshots or exports are made.
- Video/photo: creator, title/description, date, source and rights, including edits and derivative license compliance.
- Credits and funding: researchers, developers, designers, data suppliers, institutions, grant/award ID where provided, acknowledgments and declared conflicts.

## Inline citations and footnotes

- Use standard bibliographic citation `[1]`, author–year or existing lab convention consistently, with clickable anchor and return link. Citation ID stays stable across reorder.
- Footnotes are for supporting qualifications and definition details, not hiding consequential limitations or methods. Use semantic superscript links, ordered notes section, target with unique stable ID, visible focus and backlink.
- Plot source notes should identify specific dataset and version, not merely “Source: Stanford.” Critical caveats belong adjacent to the plot as well as in methods.
- When reference not available: show “Citation pending verification” only in staging/review, block publishing; do not invent a plausible DOI.
- Never use generic `© Stanford` to imply copyright ownership of licensed external imagery or research datasets.

## Example credit patterns (placeholders; do not publish as-is)

- **Companion research:** `Companion paper: [Exact title] — [authors], [venue/status], [year]. DOI: [verified link]`.
- **Data:** `Data: [publisher], “[dataset],” version [v], released [date], licensed [license]. [persistent URL]`.
- **Model:** `Method: [algorithm], version [v]; implementation [repo URL]; limitations [method link]`.
- **Photo:** `Photo: [creator] / [institution], [year], [license]; alt: [description]`.
- **Basemap:** `Map tiles © [provider], data © [contributors], [license / mandated URL]`.
- **Video:** `Video: [creator], [title], [year], [license]. Captions/transcript: [link].`.
- **Funding:** `Supported by [funder and grant number if verified].`.

## Review gates

All license terms compatible with web display **and downloads**; attribution visible at appropriate size; generated/modified visuals disclosed where material; nontext alternative verified; DOI resolves; paper status current; source permissions recorded; archive snapshot/version matched to results; media transcripts and captions reviewed by a human.
