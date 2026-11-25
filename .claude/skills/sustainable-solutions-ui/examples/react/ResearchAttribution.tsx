/** Strongly typed example; render only data provided by an authenticated editor or verified registry. */
import * as React from 'react';
export type Reference = {id: string; label: string; url?: string; kind: 'paper'|'data'|'software'|'map'|'image'|'video'|'funding'};
export type AttributionProps = {sources: Reference[]; updatedAt?: string};
export function ResearchAttribution({sources, updatedAt}: AttributionProps) {
  const groups: Reference['kind'][] = ['paper','data','software','map','image','video','funding'];
  return <section aria-labelledby="ssl-credits-heading" className="ssl-attribution">
    <h2 id="ssl-credits-heading">Research & attribution</h2>
    {updatedAt && <p>Information reviewed: <time dateTime={updatedAt}>{updatedAt}</time></p>}
    {groups.map(kind => {
      const refs = sources.filter(s => s.kind === kind);
      if (!refs.length) return null;
      return <section key={kind} aria-labelledby={`ssl-source-${kind}`}>
        <h3 id={`ssl-source-${kind}`}>{({paper:'Papers',data:'Datasets',software:'Code and methods',map:'Map attribution',image:'Image credits',video:'Video credits',funding:'Funding'})[kind]}</h3>
        <ul>{refs.map(s => <li key={s.id}>{s.url ? <a href={s.url}>{s.label}</a> : s.label}</li>)}</ul>
      </section>;
    })}
  </section>;
}
