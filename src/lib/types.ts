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
  type: 'paper' | 'press' | 'talk' | 'award' | 'other' | string;
  link: string | null;
  image_filename: string | null;
  featured: boolean;
  long_form_slug: string | null;
};

export type FeaturedItem = {
  order: number;
  title: string;
  blurb: string;
  image_filename: string | null;
  link: string;
  type: 'research' | 'tool' | 'publication' | 'news' | string;
};
