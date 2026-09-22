/**
 * components/sidebar/tool-footer.jsx
 *
 * The end-matter every map tool carries: a bulk data download, where the
 * code lives, and the initiative the work belongs to.
 *
 * The three read as one list - download, code, initiative - with no rules
 * or gaps between them, since they are the same kind of end-matter rather
 * than three separate sections, and set at one size with one icon size.
 * The repo rows carry the bare repo name: the octicon already says GitHub,
 * so "Model code on GitHub" was labelling the icon.
 *
 * Shared because the desktop sidebar and the mobile controls drawer are
 * separate trees - the sidebar is `hidden md:flex`, so on a phone it is not
 * merely off-screen, it is not rendered. That is why these three ended up
 * visible only on desktop: they were written once, into the tree that
 * phones never see. Keeping them in one component means adding a fourth
 * cannot repeat the mistake.
 */
export function ToolFooter({ config, repoLinks = null, isDark = true, compact = false }) {
  const hasRepo = repoLinks && (repoLinks.github || repoLinks.zenodo)
  if (!config.efDownload && !hasRepo && !config.initiative) return null

  return (
    <>
      {/* Bulk factor download, surfaced here so it does not require opening
          Methods to find. Config-gated: only projects that publish a factor
          table declare efDownload. */}
      {config.efDownload && (
        <a
          href={config.efDownload.href}
          download
          className={[
            'block w-full text-left bg-transparent border-0 cursor-pointer p-0 mt-2',
            'font-sans text-[12px] uppercase tracking-[0.12em] underline-offset-[3px]',
            'transition-colors hover:text-ink font-normal text-ink-3 no-underline no-rule',
          ].join(' ')}
          title={config.efDownload.title}
        >
          {config.efDownload.label}
        </a>
      )}

      {/* Repo links — octicon + mono repo name, matching the magnets
          explorer's footer pattern. Standard placement for all map tools. */}
      {hasRepo && (
        <div className="mt-2 flex flex-col gap-2">
          {repoLinks.github && (
            <a
              href={repoLinks.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:text-ink border-b-0 no-rule inline-flex items-center"
              style={{ gap: 6, fontSize: 11 }}
            >
              <svg viewBox="0 0 16 16" width={13} height={13} fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{repoLinks.github.split('/').filter(Boolean).pop()} ↗</span>
            </a>
          )}
          {repoLinks.zenodo && (
            <a
              href={repoLinks.zenodo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:text-ink border-b-0 no-rule inline-flex items-center"
              style={{ gap: 6, fontSize: 11 }}
            >
              <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                <path d="M3 12a9 3 0 0 0 18 0" />
              </svg>
              <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{repoLinks.zenodo.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')} ↗</span>
            </a>
          )}
        </div>
      )}

      {/* The initiative this work belongs to, sitting with the repo links
          because it is the same kind of statement: where the work lives and
          what it is part of. The wordmark ships in a dark and a light cut;
          pick by theme rather than filtering, which muddies a one-colour
          mark. */}
      {config.initiative && (
        <a
          href={config.initiative.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-2 hover:text-ink border-b-0 no-rule inline-flex items-center mt-2"
          // The C monogram alone, not the wordmark — the sentence already
          // says "Cornerstone", so the wordmark repeated it. Being square
          // rather than 3.8:1 it also costs almost no width, which is what
          // keeps the line inside the 285px sidebar at 11px text.
          style={{ gap: 6, fontSize: 11 }}
          aria-label={`${config.initiative.name} (opens in a new tab)`}
        >
          <img
            src={isDark && config.initiative.logoDark
              ? config.initiative.logoDark
              : config.initiative.logo}
            alt=""
            style={{ height: 17, width: 'auto', flexShrink: 0, opacity: 0.9 }}
          />
          <span>{config.initiative.note ?? <>Part of the {config.initiative.name} initiative ↗</>}</span>
        </a>
      )}
    </>
  )
}
