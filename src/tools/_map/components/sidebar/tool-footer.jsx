/**
 * components/sidebar/tool-footer.jsx
 *
 * The end-matter every map tool carries: a bulk data download, where the
 * code lives, and the initiative the work belongs to.
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
            'transition-colors hover:text-ink font-normal text-ink-3 no-underline',
          ].join(' ')}
          title={config.efDownload.title}
        >
          {config.efDownload.label}
        </a>
      )}

      {/* Repo links — octicon + mono repo name, matching the magnets
          explorer's footer pattern. Standard placement for all map tools. */}
      {hasRepo && (
        <div className={`${compact ? 'mt-4 pt-3' : 'mt-6 pt-4'} border-t border-rule flex flex-col gap-2`}>
          {repoLinks.github && (
            <a
              href={repoLinks.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:text-ink border-b-0 inline-flex items-center"
              style={{ gap: 6, fontSize: 12 }}
            >
              <svg viewBox="0 0 16 16" width={15} height={15} fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span>Model code on GitHub <span style={{ opacity: 0.6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{repoLinks.github.split('/').filter(Boolean).pop()} ↗</span></span>
            </a>
          )}
          {repoLinks.zenodo && (
            <a
              href={repoLinks.zenodo}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-2 hover:text-ink border-b-0 inline-flex items-center"
              style={{ gap: 6, fontSize: 12 }}
            >
              <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M3 5v14a9 3 0 0 0 18 0V5" />
                <path d="M3 12a9 3 0 0 0 18 0" />
              </svg>
              <span>Data archive on Zenodo <span style={{ opacity: 0.6, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{repoLinks.zenodo.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')} ↗</span></span>
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
        <div className={`${compact ? 'mt-4 pt-3' : 'mt-5 pt-4'} border-t border-rule`}>
          <a
            href={config.initiative.url}
            target="_blank"
            rel="noopener noreferrer"
            className="bare block"
            style={{ lineHeight: 0 }}
            aria-label={`${config.initiative.name} (opens in a new tab)`}
          >
            <img
              src={isDark && config.initiative.logoDark
                ? config.initiative.logoDark
                : config.initiative.logo}
              alt={config.initiative.name}
              style={{ height: 20, width: 'auto', opacity: 0.9 }}
            />
          </a>
          <p className="text-ink-3 mt-2" style={{ fontSize: 11, lineHeight: 1.5 }}>
            {config.initiative.note ?? (
              <>
                This work is part of the{' '}
                <a
                  href={config.initiative.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-2 hover:text-ink"
                >
                  {config.initiative.name} initiative ↗
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </>
  )
}
