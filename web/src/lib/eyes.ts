/**
 * Eyes — the five lenses of RaziOne Eye + the ALL overview.
 *
 * Single source of truth for eye → opportunity_type / signal_type mapping so
 * every surface (switcher, filters, badges) agrees:
 *
 *   CAREER   → JOB                          (live)
 *   BUSINESS → WEBSITE, CONSULTANCY         (Phase 3)
 *   GROWTH   → AFFILIATE                    (Phase 4)
 *   SIGNAL   → CRYPTO (signals incl. GEM_CALL) (live)
 *   CONTROL  → — (cross-cutting: tasks, gate, agents, brief, profile)
 *
 * Confirmed: CRYPTO / GEM_CALL belong to Signal Eye; Growth Eye = AFFILIATE only.
 * Content is filtered where eye-tagged; sidebar nav is narrowed per eye via
 * `navAllow` (ALL bypasses). Dashboard '/' is in every eye as home/reset anchor.
 */

import {
  Briefcase,
  Eye,
  Gem,
  LayoutDashboard,
  Store,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import type { OpportunityType, SignalType } from '@/api/types'

/* ─── Eye id + definition ───────────────────────────────────────────────────── */

export const EYE_IDS = ['ALL', 'CAREER', 'BUSINESS', 'GROWTH', 'SIGNAL', 'CONTROL'] as const
export type EyeId = (typeof EYE_IDS)[number]

export interface EyeDef {
  id: EyeId
  /** Full label — popover list, descriptors. */
  label: string
  /** Compact label — the TopBar trigger + FOCUS chip. */
  shortLabel: string
  /** One-line descriptor shown under the label in the popover. */
  description: string
  icon: LucideIcon
  /** Whether the eye is functional today (BUSINESS/GROWTH come online later). */
  live: boolean
  /** Rollout phase for non-live eyes (rendered as a PHASE badge). */
  phase?: number
  /** Opportunity types owned by this eye ([] = the eye doesn't own opportunities). */
  opportunityTypes: readonly OpportunityType[]
  /** Signal types owned by this eye ([] = ALL_SIGNAL_TYPES applies — see below). */
  signalTypes: readonly SignalType[]
  /**
   * Sidebar routes (NavItem.to values) visible under this eye. ALL lists every
   * route (no filtering). '/' is always included — home/reset anchor.
   */
  navAllow: readonly string[]
}

/** Signals not owned by a content eye (Control/ops layer) stay visible in ALL eyes. */
export const CONTROL_SIGNAL_TYPES: readonly SignalType[] = ['SOCIAL_POST', 'COMMENT']

/** All signal types — used when an eye's signalTypes is empty (ALL, CONTROL). */
export const ALL_SIGNAL_TYPES: readonly SignalType[] = [
  'JOB_POSTING',
  'SOCIAL_POST',
  'COMMENT',
  'BUSINESS_DISCOVERY',
  'GEM_CALL',
]

/** Null-safe empty → treat untyped opportunities as Career (current Phase-1 reality). */
export function normalizeOpportunityType(type: OpportunityType | null | undefined): OpportunityType {
  return type ?? 'JOB'
}

/**
 * Every sidebar route — NAV_ITEMS stays the nav source of truth; this mirror
 * exists so ALL's navAllow can't drift from the registry (nav.ts has no eye
 * knowledge, so a cross-import would be circular-adjacent).
 */
export const ALL_NAV_ROUTES: readonly string[] = [
  '/',
  '/opportunities',
  '/tasks',
  '/companies',
  '/signals',
  '/gate',
  '/agents',
  '/daily-brief',
]

export const EYES: Record<EyeId, EyeDef> = {
  ALL: {
    id: 'ALL',
    label: 'All Eyes',
    shortLabel: 'All',
    description: 'Everything, unfiltered — the full command center.',
    icon: Eye,
    live: true,
    opportunityTypes: ['JOB', 'WEBSITE', 'CONSULTANCY', 'AFFILIATE', 'CRYPTO'],
    signalTypes: ALL_SIGNAL_TYPES,
    navAllow: ALL_NAV_ROUTES,
  },
  CAREER: {
    id: 'CAREER',
    label: 'Career Eye',
    shortLabel: 'Career',
    description: 'Jobs, applications, recruiters — the JOB pipeline.',
    icon: Briefcase,
    live: true,
    opportunityTypes: ['JOB'],
    signalTypes: ['JOB_POSTING'],
    // Career workflow keeps Tasks/Signals/Gate/Daily Brief — jobs generate
    // tasks + gate actions and surface in the brief; hiding them would break
    // the loop. '/agents' excluded: Control-layer ops registry, cross-eye noise.
    navAllow: ['/', '/opportunities', '/companies', '/tasks', '/signals', '/gate', '/daily-brief'],
  },
  BUSINESS: {
    id: 'BUSINESS',
    label: 'Business Eye',
    shortLabel: 'Business',
    description: 'Websites & consultancy leads — discovery to teaser.',
    icon: Store,
    live: false,
    phase: 3,
    opportunityTypes: ['WEBSITE', 'CONSULTANCY'],
    signalTypes: ['BUSINESS_DISCOVERY'],
    // Defined for when Phase 3 comes online — leads need tasks/gate/brief too.
    navAllow: ['/', '/companies', '/signals', '/tasks', '/gate', '/daily-brief'],
  },
  GROWTH: {
    id: 'GROWTH',
    label: 'Growth Eye',
    shortLabel: 'Growth',
    description: 'Affiliate content opportunities and scheduling.',
    icon: TrendingUp,
    live: false,
    phase: 4,
    opportunityTypes: ['AFFILIATE'],
    signalTypes: [],
    // Phase 4 placeholder — content ops need tasks/brief; no companies/signals.
    navAllow: ['/', '/opportunities', '/tasks', '/gate', '/daily-brief'],
  },
  SIGNAL: {
    id: 'SIGNAL',
    label: 'Signal Eye',
    shortLabel: 'Signal',
    description: 'Crypto opportunities & gem calls — token detections.',
    icon: Gem,
    live: true,
    opportunityTypes: ['CRYPTO'],
    signalTypes: ['GEM_CALL'],
    // Agents kept: crypto detections are agent-produced, so the registry is
    // in-workflow here (unlike Career). No opportunities/tasks/gate surfaces.
    navAllow: ['/', '/signals', '/agents', '/daily-brief'],
  },
  CONTROL: {
    id: 'CONTROL',
    label: 'Control Eye',
    shortLabel: 'Control',
    description: 'Tasks, gate, agents, briefs — the operating layer.',
    icon: LayoutDashboard,
    live: true,
    opportunityTypes: [],
    signalTypes: ALL_SIGNAL_TYPES,
    navAllow: ['/', '/tasks', '/gate', '/agents', '/daily-brief'],
  },
}

/** Switcher order — ALL first, then the five eyes. */
export const EYE_LIST: readonly EyeDef[] = EYE_IDS.map((id) => EYES[id])

/* ─── Lookup helpers ────────────────────────────────────────────────────────── */

/** Eye that owns an opportunity type. CRYPTO → SIGNAL. Unknown/null → CAREER. */
export function eyeForOpportunityType(type: OpportunityType | null | undefined): EyeId {
  const t = normalizeOpportunityType(type)
  if (t === 'JOB') return 'CAREER'
  if (t === 'WEBSITE' || t === 'CONSULTANCY') return 'BUSINESS'
  if (t === 'AFFILIATE') return 'GROWTH'
  return 'SIGNAL' // CRYPTO
}

/**
 * Eye that owns a signal type. GEM_CALL → SIGNAL.
 * SOCIAL_POST / COMMENT are ops-layer signals (not eye-owned) → CONTROL.
 */
export function eyeForSignalType(type: SignalType | null | undefined): EyeId {
  switch (type) {
    case 'JOB_POSTING':
      return 'CAREER'
    case 'BUSINESS_DISCOVERY':
      return 'BUSINESS'
    case 'GEM_CALL':
      return 'SIGNAL'
    default:
      return 'CONTROL'
  }
}

/**
 * Whether an opportunity belongs to the focused eye.
 * ALL → everything. CONTROL → never hides opportunities (global surface).
 */
export function opportunityInEye(type: OpportunityType | null | undefined, focus: EyeId): boolean {
  if (focus === 'ALL' || focus === 'CONTROL') return true
  return eyeForOpportunityType(type) === focus
}

/**
 * Whether a signal belongs to the focused eye. Ops-layer signal types
 * (SOCIAL_POST / COMMENT) remain visible in every eye.
 */
export function signalInEye(type: SignalType | null | undefined, focus: EyeId): boolean {
  if (focus === 'ALL' || focus === 'CONTROL') return true
  if (CONTROL_SIGNAL_TYPES.includes(type as SignalType)) return true
  return eyeForSignalType(type) === focus
}
