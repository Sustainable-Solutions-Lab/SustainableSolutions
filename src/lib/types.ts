// Shared types for the structured-data layer (built from CSV → JSON at build time).

export type Person = {
  slug: string;
  name: string;
  role: string;
  unit: 'main' | 'ciu' | string;
  status: 'current' | 'alumni' | string;
  photo_filename: string | null;
  current_position: string | null;
  personal_url: string | null;
  bio_short: string | null;
  joined_date: string | null;
  left_date: string | null;
  order: number;
  // Optional contact / profile links (active members make heaviest use)
  email: string | null;
  scholar_url: string | null;
  orcid: string | null;
  cv_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  // DOIs of publications to feature on the person's active-member card. If
  // blank, the card falls back to most-cited (notable) and most-recent
  // (recent) papers detected on the person's authorship.
  notable_pub_doi: string | null;
  recent_pub_doi: string | null;
};

export type Publication = {
  authors: string;
  title: string;
  journal: string;
  year: number;
  month: number | null;
  volume_issue: string | null;
  pages: string | null;
  doi: string;
  url: string | null;
  pdf_url: string | null;
  code_url: string | null;
  themes: string[];
  // Two-axis taxonomy added on top of the free-form themes column.
  // system   — { energy | food | water | materials } (multi-value)
  // response — { mitigation | mitigation:trade | mitigation:corporate
  //              | mitigation:carbon-management | impacts
  //              | impacts:air-pollution | impacts:heat | impacts:flooding }
  system: string[];
  response: string[];
  lab_authors: string[];
  featured: boolean;
  press_url: string | null;
  // Optional richer-card columns — used for featured publications.
  abstract: string | null;
  summary: string | null;         // one-sentence summary, shown on featured cards
  image_filename: string | null;  // hero image, lives at /public/publications/
  brief_url: string | null;       // research brief link
  ppt_url: string | null;         // slides link
};

export type NewsItem = {
  date: string;
  title: string;
  summary: string;
  type: 'paper' | 'press' | 'op-ed' | 'talk' | 'award' | 'other' | string;
  link: string | null;
  image_filename: string | null;
  featured: boolean;
  long_form_slug: string | null;
  // Press items often refer to a specific publication. Setting `doi` lets
  // the news card surface the companion paper and inherit system/topic.
  doi: string | null;
  system: string[];     // multi-value, comma-separated in sheet
  topic: string[];      // multi-value, comma-separated in sheet (matrix "response")
  source: string | null;  // outlet name shown as the eyebrow (e.g. "New York Times")
};

export type Tool = {
  slug: string;
  title: string;
  eyebrow: string | null;       // e.g., "INTERACTIVE MAP", "DATASET", "CODE"
  summary: string | null;       // one-line card description
  description: string | null;   // longer prose for the detail page
  image_filename: string | null;
  link: string | null;          // internal route or external URL
  doi: string | null;           // companion publication's DOI
  order: number;
};

export type FeaturedItem = {
  order: number;
  title: string;
  blurb: string;
  image_filename: string | null;
  link: string | null;
  type: 'research' | 'tool' | 'publication' | 'news' | string;
  // Optional. If `type` is "publication", a DOI here resolves the card's
  // link to the paper's URL and surfaces journal + year on the card.
  doi: string | null;
};
