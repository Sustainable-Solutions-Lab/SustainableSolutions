# Template — Research & attribution with inline footnotes

## Inline example (placeholder references)

“Under the alternative scenario, the modeled index changes relative to the baseline [1]. The number is illustrative only.¹”

```html
<p>... <a href="#ref-1" aria-label="See reference 1">[1]</a> ...
  <sup><a href="#fn-1" id="fnref-1" aria-label="Footnote 1">1</a></sup></p>
<section aria-labelledby="refs-title">
  <h2 id="refs-title">Research & attribution</h2>
  <ol><li id="ref-1">[verified author]. [verified title]. [venue, year].
    <a href="[verified-doi-url]">DOI</a></li></ol>
  <h3>Data and code</h3><p>[source/version/license] · [code version/repo]</p>
  <h3>Media and maps</h3><p>[creator, provider, attribution, licenses]</p>
</section>
<section aria-labelledby="notes-title"><h2 id="notes-title">Notes</h2>
  <ol><li id="fn-1">[noncritical qualification] <a href="#fnref-1" aria-label="Return to footnote 1 reference">↩</a></li></ol>
</section>
```

### Rules
DOI/paper metadata and publication status must be verified; dataset and software versions are separate entities. Label sources right next to visualization and in a structured full credits section. Include map and media rights on all exports. Funding acknowledgements and disclosure of potential conflicts where relevant. Critical caveats must never be relegated to tiny footnotes.
