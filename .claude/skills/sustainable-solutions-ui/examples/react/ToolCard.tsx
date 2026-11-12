/** Illustrative framework-specific helper; adapt to actual project stack/styles. */
import * as React from 'react';

type VerifiedReference = {
  title: string;
  href: string;
  venueOrStatus?: string;
};
export type ToolKind =
  | 'INTERACTIVE MODEL'
  | 'INTERACTIVE MAP AND MODEL'
  | 'INTERACTIVE MAP'
  | 'OPEN DATA INITIATIVE';
export type Tool = {
  id: string;
  type: ToolKind;
  title: string;
  description: string;
  href: string;
  paper?: VerifiedReference;
  codeUrl?: string;
  dataArchiveUrl?: string;
};

export function ToolCard({tool}: {tool: Tool}) {
  return (
    <article className="ssl-tool-card" aria-labelledby={`tool-${tool.id}`}>
      <p className="ssl-tool-type">{tool.type}</p>
      <h3 id={`tool-${tool.id}`}><a href={tool.href}>{tool.title}</a></h3>
      <p>{tool.description}</p>
      {tool.paper && (
        <div className="ssl-research-meta">
          <p className="ssl-eyebrow">COMPANION PAPER</p>
          <a href={tool.paper.href}>{tool.paper.title}</a>
          {tool.paper.venueOrStatus && <p>{tool.paper.venueOrStatus}</p>}
        </div>
      )}
      <div className="ssl-source-links" aria-label="Supporting resources">
        {tool.codeUrl && <a href={tool.codeUrl}>GitHub (source code)</a>}
        {tool.dataArchiveUrl && <a href={tool.dataArchiveUrl}>Zenodo (data archive)</a>}
      </div>
    </article>
  );
}
