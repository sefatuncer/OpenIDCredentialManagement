/**
 * SD-JWT Presentation Service
 *
 * Handles selective disclosure filtering for VP presentations.
 * Rebuilds SD-JWT combined string with only selected disclosures.
 */

import { parseSDJWT } from './sdjwt.service'
import type { Disclosure } from '../types/sdjwt.types'

export interface SelectableDisclosure {
  claimName: string
  claimValue: unknown
  encoded: string
  selected: boolean
}

/**
 * Get selectable disclosures from an SD-JWT combined string.
 * Each disclosure can be toggled on/off for selective presentation.
 */
export function getSelectableDisclosures(combined: string): SelectableDisclosure[] {
  const parsed = parseSDJWT(combined)
  if (!parsed) return []

  return parsed.disclosures.map((d: Disclosure) => ({
    claimName: d.claimName,
    claimValue: d.claimValue,
    encoded: d.encoded,
    selected: true, // all selected by default
  }))
}

/**
 * Build an SD-JWT presentation string with only selected disclosures.
 * Format: jwt~disclosure1~disclosure2~...~
 *
 * The trailing ~ is required by the SD-JWT spec for presentations.
 */
export function buildSDJWTPresentation(
  combined: string,
  selectedClaimNames: string[]
): string {
  const parsed = parseSDJWT(combined)
  if (!parsed) return combined

  const selectedDisclosures = parsed.disclosures.filter(
    (d: Disclosure) => selectedClaimNames.includes(d.claimName)
  )

  // Rebuild: jwt~selected_disclosure1~selected_disclosure2~
  const parts = [parsed.jwt, ...selectedDisclosures.map((d: Disclosure) => d.encoded), '']
  return parts.join('~')
}
