/**
 * Score band derivation — mirrors @razione-eye/shared `bandForScore`.
 * source of truth: @razione-eye/shared
 *
 * NOTE: the server computes `band` on opportunity reads (contract §3); the FE
 * reads it and never derives it. This helper exists ONLY so the mock dataset
 * can shape parity with real API responses.
 */

import type { ScoreBand } from '../types'

export function bandForScore(score: number | null | undefined): ScoreBand {
  if (score == null) return 'ARCHIVE'
  if (score >= 90) return 'PRIORITY'
  if (score >= 75) return 'APPLY'
  if (score >= 60) return 'REVIEW'
  return 'ARCHIVE'
}
