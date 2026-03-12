/**
 * SD-JWT Presentation Service
 * Handles selective disclosure filtering for VP presentations.
 * Pure JS — no browser-specific APIs.
 */

import { parseSDJWT } from './sdjwt.service'
import type { Disclosure } from '../types/sdjwt.types'

export interface SelectableDisclosure {
  claimName: string
  claimValue: unknown
  encoded: string
  selected: boolean
}

export function getSelectableDisclosures(combined: string): SelectableDisclosure[] {
  const parsed = parseSDJWT(combined)
  if (!parsed) return []

  return parsed.disclosures.map((d: Disclosure) => ({
    claimName: d.claimName,
    claimValue: d.claimValue,
    encoded: d.encoded,
    selected: true,
  }))
}

export function buildSDJWTPresentation(
  combined: string,
  selectedClaimNames: string[]
): string {
  const parsed = parseSDJWT(combined)
  if (!parsed) return combined

  const selectedDisclosures = parsed.disclosures.filter(
    (d: Disclosure) => selectedClaimNames.includes(d.claimName)
  )

  const parts = [parsed.jwt, ...selectedDisclosures.map((d: Disclosure) => d.encoded), '']
  return parts.join('~')
}
