/**
 * EYE-6 mock seed — the 30 business pitch prospects as COMPANY + business
 * OPPORTUNITY nodes, mirroring the EYE-5 import shape
 * (server/src/import/prospects.ts): status PROBLEM_IDENTIFIED,
 * score = opportunity_score, data.company/company_id, campaign band/segment/
 * agentic fields in data. `belongs_to` edges derive in data.ts from
 * data.company_id. Mock-only — the real deployment reads the imported rows
 * from the live DB.
 */

import type { Company, Opportunity } from '../types'
import { bandForScore } from './band'
import { PROSPECT_SEEDS } from './prospects-data'

// Import anchor for the seeded batch (before MOCK_NOW, 2026-09-02).
const IMPORTED_AT = '2026-08-28T09:00:00.000Z'
const IMPORTED_UPDATED_AT = '2026-08-28T09:10:00.000Z'

/** 26-char deterministic ids — C suffix companies, O suffix opportunities. */
const companyId = (i: number): string => `01JDYPROSPECTC${String(i + 1).padStart(12, '0')}`
const opportunityId = (i: number): string => `01JDYPROSPECTO${String(i + 1).padStart(12, '0')}`

export const mockProspectCompanies: Company[] = PROSPECT_SEEDS.map((seed, i) => ({
  id: companyId(i),
  type: 'COMPANY',
  name: seed.name,
  status: null,
  opportunity_type: null,
  score: null,
  due_at: null,
  source: 'import',
  tags: ['imported', 'prospect'],
  notes: [],
  data: {
    industry: seed.category,
    segment: seed.category_group,
    location: seed.location,
    website: seed.website,
    size: seed.size,
    entity_type: seed.entity_type,
  },
  created_at: IMPORTED_AT,
  updated_at: IMPORTED_AT,
}))

export const mockProspectOpportunities: Opportunity[] = PROSPECT_SEEDS.map((seed, i) => {
  const company = mockProspectCompanies[i]
  const typeLabel = seed.opportunity_type === 'WEBSITE' ? 'Website' : 'Consultancy'
  return {
    id: opportunityId(i),
    type: 'OPPORTUNITY',
    name: `${seed.name} — ${typeLabel} opportunity`,
    status: 'PROBLEM_IDENTIFIED',
    opportunity_type: seed.opportunity_type,
    score: seed.opportunity_score,
    due_at: null,
    source: 'import',
    tags: ['imported', 'prospect'],
    notes: [],
    data: {
      company: seed.name,
      company_id: company.id,
      sub_scores: seed.sub_scores,
      band: seed.band,
      segment: seed.category_group,
      agentic_fit: seed.agentic_fit,
      suggested_agentic_offer: seed.suggested_agentic_offer,
      source_url: seed.source,
      fit_reason: seed.fit_reason,
      problems_detected: [seed.fit_reason],
      rank: seed.rank,
      import_file: 'prospects-final-30.json',
    },
    created_at: IMPORTED_AT,
    updated_at: IMPORTED_UPDATED_AT,
    band: bandForScore(seed.opportunity_score),
    company,
  }
})
