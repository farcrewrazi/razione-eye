/**
 * Job Analyst — deterministic scoring rules (T1.3.2).
 *
 * Pure functions over plain inputs; no DB, no clock. Unit-tested directly.
 *
 * Sub-score rule table (all 0–100):
 *
 * ┌───────────────┬────────────────────────────────────────────────────────────┐
 * │ role_match    │ seniority alignment × stack overlap, blended 60/40.        │
 * │               │ seniority: role Senior/Lead vs profile Senior → 100;       │
 * │               │   Mid/junior wording → 75; unknown → 60                    │
 * │               │ stack: |overlap ∩ profile.skills| / |role stack| ×100;     │
 * │               │   role stack unknown → 70 baseline                         │
 * ├───────────────┼────────────────────────────────────────────────────────────┤
 * │ company_match │ software house / tech industry → 90; known brand → 85;     │
 * │               │   unknown industry → 60; non-tech → 40;                    │
 * │               │   adjust +5 size 50–500, −10 size >5000 (cap 0–100)        │
 * ├───────────────┼────────────────────────────────────────────────────────────┤
 * │ ai_culture    │ each AI-culture marker → +20, cap 100; none → 50;          │
 * │               │   explicit "no AI" → 20                                    │
 * ├───────────────┼────────────────────────────────────────────────────────────┤
 * │ location      │ Cyberjaya → 100 (hybrid Cyberjaya → 95 if noted);          │
 * │               │   nearby (KL, Sepang, Putrajaya, Bangi, Dengkil, Puchong)  │
 * │               │   → 80; elsewhere in MY → 40; unknown → 60                 │
 * ├───────────────┼────────────────────────────────────────────────────────────┤
 * │ salary        │ range midpoint within target band → 100; ≥10% below band   │
 * │               │   min → 70; ≥25% below → 40; above band max → 90;          │
 * │               │   unknown → 60                                             │
 * ├───────────────┼────────────────────────────────────────────────────────────┤
 * │ career_upside │ Senior role vs Senior profile → 70; Lead/Principal → 90;   │
 * │               │   other/unknown → 60; +15 AI-culture bonus;                │
 * │               │   +5 new-stack learning; cap 100                           │
 * └───────────────┴────────────────────────────────────────────────────────────┘
 */
import type { CompanyData, PersonData } from '@razione-eye/shared';

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

// ─── Stack tokens (canonical → aliases) ──────────────────────────────────────

const STACK_CANONICAL: ReadonlyArray<[string, string[]]> = [
  ['Node.js', ['node.js', 'nodejs', 'node js']],
  ['TypeScript', ['typescript']],
  ['JavaScript', ['javascript']],
  ['React', ['react']],
  ['Vue.js', ['vue.js', 'vuejs', 'vue']],
  ['Go', ['golang']],
  ['Python', ['python']],
  ['Java', ['java']],
  ['PHP', ['php']],
  ['Rust', ['rust']],
  ['Kubernetes', ['kubernetes', 'k8s']],
  ['AWS', ['aws', 'amazon web services']],
  ['GCP', ['gcp', 'google cloud']],
  ['Docker', ['docker']],
  ['PostgreSQL', ['postgresql', 'postgres']],
  ['MySQL', ['mysql']],
  ['MongoDB', ['mongodb', 'mongo']],
  ['Redis', ['redis']],
  ['GraphQL', ['graphql']],
  ['Laravel', ['laravel']],
  ['Express', ['express']],
  ['SQL', ['sql']],
  ['AI orchestration', ['ai orchestration', 'multi-agent orchestration']],
  ['LLM tooling', ['llm tooling', 'langchain']],
];

/** Multi-word tokens first so "Node.js" wins over "Java" substring checks. */
const STACK_ALIAS_PATTERNS: ReadonlyArray<{ canonical: string; re: RegExp }> =
  STACK_CANONICAL.flatMap(([canonical, aliases]) =>
    [canonical.toLowerCase(), ...aliases].map((alias) => ({
      canonical,
      re: new RegExp(`(^|[^a-z0-9+#.])${escapeRe(alias)}(?![a-z0-9+#])`, 'i'),
    })),
  ).sort((a, b) => b.re.source.length - a.re.source.length);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Scan free text for known stack tokens → canonical names, deduped, first-seen order. */
export function extractStackTokens(text: string): string[] {
  const found: string[] = [];
  for (const { canonical, re } of STACK_ALIAS_PATTERNS) {
    if (re.test(text) && !found.includes(canonical)) found.push(canonical);
  }
  return found;
}

/** Canonicalize one stack string (exact/alias match → canonical; else trimmed original). */
export function canonicalStackToken(token: string): string {
  const lower = token.trim().toLowerCase();
  for (const [canonical, aliases] of STACK_CANONICAL) {
    if (lower === canonical.toLowerCase() || aliases.includes(lower)) return canonical;
  }
  return token.trim();
}

function canonSet(tokens: string[] | undefined): Set<string> {
  return new Set((tokens ?? []).map((t) => canonicalStackToken(t).toLowerCase()));
}

// ─── AI-culture markers ──────────────────────────────────────────────────────

export const AI_CULTURE_MARKERS = [
  'AI-assisted',
  'Claude Code',
  'Cursor',
  'Copilot',
  'multi-agent',
  'vibe coding',
  'AI orchestration',
  'LLM',
] as const;

const AI_MARKER_RES: ReadonlyArray<RegExp> = [
  /ai[- ]assisted/i,
  /claude code/i,
  /\bcursor\b/i,
  /\bcopilot\b/i,
  /multi[- ]agent/i,
  /vibe coding/i,
  /ai orchestration/i,
  /\bllm(s)?\b/i,
];

/**
 * Detect which AI-culture markers appear in text (canonical marker names, deduped).
 * Canonical names are matched literally first so stored phrases like
 * "AI-assisted development" (profile prefs) always count.
 */
export function detectAiMarkers(text: string): string[] {
  const found: string[] = [];
  AI_CULTURE_MARKERS.forEach((marker, i) => {
    if (text.toLowerCase().includes(marker.toLowerCase()) || AI_MARKER_RES[i]!.test(text)) {
      if (!found.includes(marker)) found.push(marker);
    }
  });
  return found;
}

// ─── Locations ───────────────────────────────────────────────────────────────

/** Nearby cities → 80 (doc 02 §6.1: Cyberjaya is the hard 100). */
const NEARBY: ReadonlyArray<{ re: RegExp; name: string }> = [
  { re: /\bkl\b|kuala lumpur/i, name: 'Kuala Lumpur' },
  { re: /\bsepang\b/i, name: 'Sepang' },
  { re: /\bputrajaya\b/i, name: 'Putrajaya' },
  { re: /\bbangi\b/i, name: 'Bangi' },
  { re: /\bdengkil\b/i, name: 'Dengkil' },
  { re: /\bpuchong\b/i, name: 'Puchong' },
];

const MALAYSIA_RE = /\b(malaysia|selangor|klang valley|petaling jaya|\bpj\b|subang|shah alam|mont kiara|bangsar|cyberjaya|kuala lumpur|putrajaya|sepang|bangi|dengkil|puchong|penang|johor)\b/i;
const REMOTE_MY_RE = /\bremote\b[^\n.]*\bmalaysia\b|\bmalaysia\b[^\n.]*\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;

/** First location city found in free text (Cyberjaya wins over nearby). */
export function detectLocation(text: string): string | null {
  if (/\bcyberjaya\b/i.test(text)) return 'Cyberjaya';
  for (const { re, name } of NEARBY) {
    if (re.test(text)) return name;
  }
  if (/\bpetaling jaya\b/i.test(text)) return 'Petaling Jaya';
  return null;
}

// ─── Salary parsing ──────────────────────────────────────────────────────────

export interface SalaryRange {
  min: number;
  max: number;
}

/** First RM salary (range or single) in text → monthly MYR min/max. */
export function parseSalaryToMinMax(text: string): SalaryRange | null {
  const re =
    /rm\s*([\d][\d,]*(?:\.\d+)?)\s*(k)?\s*(?:[-–—to]+\s*(?:rm\s*)?([\d][\d,]*(?:\.\d+)?)\s*(k)?)?/gi;
  const m = re.exec(text);
  if (!m) return null;
  const n1 = Number(m[1]!.replace(/,/g, '')) * (m[2] ? 1000 : 1);
  if (!Number.isFinite(n1) || n1 < 500 || n1 > 200_000) return null; // implausible → ignore
  const n2raw = m[3] ? Number(m[3].replace(/,/g, '')) * (m[4] ? 1000 : 1) : null;
  const n2 = n2raw !== null && Number.isFinite(n2raw) && n2raw >= 500 ? n2raw : null;
  const lo = Math.round(n2 !== null ? Math.min(n1, n2) : n1);
  const hi = Math.round(n2 !== null ? Math.max(n1, n2) : n1);
  return { min: lo, max: hi };
}

// ─── Seniority ───────────────────────────────────────────────────────────────

export type Seniority = 'lead' | 'senior' | 'mid' | 'unknown';

/** Infer the seniority a role title is pitched at. */
export function inferSeniorityFromTitle(title: string): Seniority {
  if (/\b(principal|lead|head|staff|architect|manager|director)\b/i.test(title)) return 'lead';
  if (/\b(senior|sr\.?)\b/i.test(title)) return 'senior';
  if (/\b(junior|jr\.?|associate|graduate|intern|entry)\b/i.test(title)) return 'mid';
  return 'unknown';
}

function profileSeniorityRank(p: PersonData | null): number {
  const s = (p?.seniority ?? '').toLowerCase();
  if (/\b(lead|principal|head|staff|architect)\b/.test(s)) return 3;
  if (/\b(senior|sr)\b/.test(s)) return 2;
  if (/\b(mid|intermediate)\b/.test(s)) return 1;
  return 0;
}

// ─── Known brands (company_match boost) ──────────────────────────────────────

const KNOWN_BRANDS = [
  'google', 'microsoft', 'amazon', 'meta', 'apple', 'grab', 'shopee', 'sea', 'airasia',
  'maybank', 'cimb', 'petronas', 'maxis', 'celcom', 'digi', 'tm', 'lazada', 'tiktok',
  'bytedance', 'agoda', 'foodpanda', 'accenture', 'deloitte', 'kpmg', 'pwc', 'ey',
  'tng', 'touch n go', 'boost', 'setel', 'carsome', 'iflix', 'astro',
] as const;

const TECH_INDUSTRY_RE =
  /\b(software|tech(nology|nologies)?|it services|digital|saas|fintech|cloud|data|ai\b|artificial intelligence|platform|internet|cyber|systems|solutions|labs|analytics|robotics|mobility|energy tech|healthtech|edtech|e-?commerce)\b/i;
const NON_TECH_RE =
  /\b(construction|manufactur|hotel|restaurant|f&b|food|retail|logistics company|plantation|property development|real estate agency|clinic|dental|hospital)\b/i;

// ─── Sub-scores ──────────────────────────────────────────────────────────────

/** role_match = seniority alignment (60%) × stack overlap (40%). */
export function scoreRoleMatch(
  profile: PersonData | null,
  roleTitle: string,
  roleStack: string[] | undefined,
): number {
  const roleSen = inferSeniorityFromTitle(roleTitle);
  const profRank = profileSeniorityRank(profile);
  let seniority: number;
  if (roleSen === 'unknown') seniority = 60;
  else if (roleSen === 'mid') seniority = 75;
  else {
    // senior or lead vs a Senior+ profile aligns fully
    seniority = profRank >= 2 ? 100 : profRank === 1 ? 75 : 60;
  }

  let stack: number;
  if (!roleStack || roleStack.length === 0) {
    stack = 70; // unknown stack baseline
  } else {
    const required = canonSet(roleStack);
    const mine = canonSet(profile?.skills);
    let overlap = 0;
    for (const token of required) if (mine.has(token)) overlap++;
    stack = Math.round((overlap / required.size) * 100);
  }
  return clamp(Math.round(seniority * 0.6 + stack * 0.4));
}

/** company_match — industry/type, known brands, size adjustments. */
export function scoreCompanyMatch(
  company: CompanyData | null,
  companyName: string | null,
  opportunityCompanyName?: string | null,
): number {
  const industry = company?.industry?.trim() ?? '';
  const name = (companyName ?? opportunityCompanyName ?? '').toLowerCase();
  let base: number;
  if (KNOWN_BRANDS.some((b) => name.includes(b))) base = 85;
  else if (!industry) base = 60;
  else if (NON_TECH_RE.test(industry)) base = 40;
  else if (TECH_INDUSTRY_RE.test(industry)) base = 90;
  else base = 60;

  let adjust = 0;
  const size = company?.size?.trim() ?? '';
  if (size) {
    const nums = size.match(/[\d,]+/g)?.map((s) => Number(s.replace(/,/g, ''))) ?? [];
    const max = nums.length > 0 ? Math.max(...nums) : null;
    const min = nums.length > 0 ? Math.min(...nums) : null;
    if (max !== null && max > 5000) adjust = -10;
    else if (max !== null && min !== null && max >= 50 && min <= 500) adjust = 5;
    else if (max !== null && max >= 50 && max <= 500) adjust = 5;
  }
  return clamp(base + adjust);
}

/** ai_culture — each marker +20 (cap 100); none → 50; explicit "no AI" → 20. */
export function scoreAiCulture(markers: string[]): number {
  if (markers.some((m) => EXPLICIT_NO_AI_RE.test(m))) return 20;
  if (markers.length === 0) return 50;
  return clamp(markers.length * 20);
}

const EXPLICIT_NO_AI_RE = /\bno ai\b/i;

/** location — Cyberjaya 100 (hybrid 95), nearby 80, elsewhere in MY 40, unknown 60. */
export function scoreLocation(location: string | null): number {
  if (!location || location.trim() === '') return 60;
  const s = location.toLowerCase();
  if (/\bcyberjaya\b/.test(s)) return HYBRID_RE.test(s) ? 95 : 100;
  for (const { re } of NEARBY) if (re.test(s)) return 80;
  if (REMOTE_MY_RE.test(s) || MALAYSIA_RE.test(s)) return 40;
  return 40; // named but not in Malaysia → out of pipeline focus
}

/** salary — range midpoint vs profile target band. */
export function scoreSalary(
  profile: PersonData | null,
  salaryMin: number | null,
  salaryMax: number | null,
): number {
  const tMin = profile?.salary_min;
  const tMax = profile?.salary_max;
  const hasRange = salaryMin != null || salaryMax != null;
  if (!hasRange) return 60;
  if (tMin == null || tMax == null) return 60; // no target band to compare against
  const lo = salaryMin ?? salaryMax!;
  const hi = salaryMax ?? salaryMin!;
  const midpoint = (lo + hi) / 2;
  if (midpoint >= tMin && midpoint <= tMax) return 100;
  if (midpoint > tMax) return 90; // money is good
  const deficit = (tMin - midpoint) / tMin;
  if (deficit >= 0.25) return 40;
  if (deficit >= 0.1) return 70;
  return 90; // slightly below band min (<10%)
}

/** career_upside — seniority step-up + AI-culture bonus + new-stack learning. */
export function scoreCareerUpside(
  roleSeniority: Seniority,
  aiMarkerCount: number,
  roleStack: string[] | undefined,
  profileSkills: string[] | undefined,
): number {
  let base: number;
  if (roleSeniority === 'lead') base = 90;
  else if (roleSeniority === 'senior') base = 70;
  else if (roleSeniority === 'mid') base = 50;
  else base = 60;

  const aiBonus = aiMarkerCount > 0 ? 15 : 0;

  let learning = 0;
  if (roleStack && roleStack.length > 0) {
    const mine = canonSet(profileSkills);
    const hasNew = canonSet(roleStack);
    let newCount = 0;
    for (const t of hasNew) if (!mine.has(t)) newCount++;
    if (newCount > 0) learning = 5;
  }
  return clamp(base + aiBonus + learning);
}
