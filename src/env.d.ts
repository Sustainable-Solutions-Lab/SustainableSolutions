/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly SHEET_PUBLICATIONS_CSV: string;
  readonly SHEET_PEOPLE_CSV: string;
  readonly SHEET_NEWS_CSV: string;
  readonly SHEET_FEATURED_CSV: string;
  readonly VERCEL_DEPLOY_HOOK_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
