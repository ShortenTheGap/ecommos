import { describe, it, expect } from 'vitest'
import {
  approvedClaimPhrases,
  validateClaims,
  claimsForType,
} from '@/lib/domain/guardrails'
import type { Claim } from '@/lib/types'

// ---------------------------------------------------------------------------
// Helpers — minimal valid Claim objects
// ---------------------------------------------------------------------------

const makeClaim = (overrides: Partial<Claim> = {}): Claim => ({
  id: 'claim-1',
  organization_id: 'org-1',
  product_id: null,
  claim_text: 'Made with organic ingredients',
  claim_type: 'ingredient',
  evidence: 'Organic certification COA #2024-001',
  approval_status: 'approved',
  risk_level: 'low',
  channels_used: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: null,
  ...overrides,
})

// ---------------------------------------------------------------------------
// 1. approvedClaimPhrases
// ---------------------------------------------------------------------------

describe('approvedClaimPhrases', () => {
  it('returns only approved claims with non-empty evidence', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'c1', approval_status: 'approved', evidence: 'COA #001' }),
      makeClaim({ id: 'c2', approval_status: 'pending', evidence: 'Lab result pending' }),
      makeClaim({ id: 'c3', approval_status: 'rejected', evidence: 'Third-party test' }),
      makeClaim({ id: 'c4', approval_status: 'approved', evidence: null }),
    ]
    const result = approvedClaimPhrases(claims)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('c1')
  })

  it('excludes an approved claim with null evidence', () => {
    const claim = makeClaim({ approval_status: 'approved', evidence: null })
    expect(approvedClaimPhrases([claim])).toHaveLength(0)
  })

  it('excludes an approved claim with empty string evidence', () => {
    const claim = makeClaim({ approval_status: 'approved', evidence: '' })
    expect(approvedClaimPhrases([claim])).toHaveLength(0)
  })

  it('returns empty array when given empty claims array', () => {
    expect(approvedClaimPhrases([])).toHaveLength(0)
  })

  it('returns all approved+evidenced claims when all qualify', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'c1', approval_status: 'approved', evidence: 'COA #001' }),
      makeClaim({ id: 'c2', approval_status: 'approved', evidence: 'Lab test #002' }),
    ]
    expect(approvedClaimPhrases(claims)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 2. validateClaims — citation detection
// ---------------------------------------------------------------------------

describe('validateClaims — citation detection', () => {
  it('cites an approved+evidenced claim found verbatim in the draft', () => {
    const claim = makeClaim({
      id: 'honey-claim',
      claim_text: 'Made with 100% raw wildflower honey',
      approval_status: 'approved',
      evidence: 'COA #WFH-2024-88',
    })
    const draft = 'Our product is Made with 100% raw wildflower honey, harvested fresh.'
    const result = validateClaims(draft, [claim])

    expect(result.ok).toBe(true)
    expect(result.blocked).toHaveLength(0)
    expect(result.citations).toHaveLength(1)
    expect(result.citations[0].claimId).toBe('honey-claim')
    expect(result.citations[0].evidence).toBe('COA #WFH-2024-88')
  })

  it('does NOT block an approved+evidenced claim even if it contains a risky phrase like "100%"', () => {
    // "100% healthy" would normally be risky, but if the full phrase is an
    // approved+evidenced claim, it must NOT be blocked. Approved claims win.
    const claim = makeClaim({
      id: 'honey-claim',
      claim_text: 'Made with 100% raw wildflower honey',
      approval_status: 'approved',
      evidence: 'COA #WFH-2024-88',
    })
    const draft = 'Our bees produce Made with 100% raw wildflower honey for every jar.'
    const result = validateClaims(draft, [claim])

    expect(result.ok).toBe(true)
    expect(result.blocked).toHaveLength(0)
  })

  it('is case-insensitive when matching claim_text', () => {
    const claim = makeClaim({
      id: 'c1',
      claim_text: 'Rich in antioxidants',
      approval_status: 'approved',
      evidence: 'ORAC score analysis 2024',
    })
    const draft = 'Every serving is rich in antioxidants from natural sources.'
    const result = validateClaims(draft, [claim])

    expect(result.citations.some(c => c.claimId === 'c1')).toBe(true)
  })

  it('does not cite a pending claim even if text matches', () => {
    const claim = makeClaim({
      id: 'c1',
      claim_text: 'Made with organic oats',
      approval_status: 'pending',
      evidence: 'Certification in progress',
    })
    const draft = 'Made with organic oats for breakfast.'
    // pending = not approved, so no citation. It may also be blocked by denylist
    // (but "organic oats" is not on the denylist — just not cited)
    const result = validateClaims(draft, [claim])
    expect(result.citations.some(c => c.claimId === 'c1')).toBe(false)
  })

  it('does not cite a rejected claim', () => {
    const claim = makeClaim({
      id: 'c1',
      claim_text: 'Supports heart health',
      approval_status: 'rejected',
      evidence: 'Study reference 2023',
    })
    const draft = 'Our formula supports heart health daily.'
    const result = validateClaims(draft, [claim])
    expect(result.citations.some(c => c.claimId === 'c1')).toBe(false)
  })

  it('does not cite an approved claim with no evidence', () => {
    const claim = makeClaim({
      id: 'c1',
      claim_text: 'Gluten-free formula',
      approval_status: 'approved',
      evidence: null,
    })
    const draft = 'Our gluten-free formula is safe for everyone.'
    const result = validateClaims(draft, [claim])
    expect(result.citations.some(c => c.claimId === 'c1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 3. validateClaims — denylist blocking
// ---------------------------------------------------------------------------

describe('validateClaims — denylist blocking', () => {
  it('blocks "clinically proven to boost immunity" with no matching approved claim', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'c1', approval_status: 'rejected', evidence: 'Rejected study' }),
    ]
    const draft = 'Our supplement is clinically proven to boost immunity in just 7 days.'
    const result = validateClaims(draft, claims)

    expect(result.ok).toBe(false)
    expect(result.blocked.length).toBeGreaterThan(0)
    expect(result.blocked[0].severity).toBe('high')
    expect(result.sanitizedText).not.toContain('clinically proven to boost immunity')
  })

  it('blocks "cure disease" type claims with high severity', () => {
    const draft = 'This product can cure chronic illness naturally.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(false)
    const highSeverity = result.blocked.filter(b => b.severity === 'high')
    expect(highSeverity.length).toBeGreaterThan(0)
  })

  it('blocks "FDA-approved" claim with high severity', () => {
    const draft = 'Our product is FDA-approved for daily consumption.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(false)
    expect(result.blocked.some(b => b.severity === 'high')).toBe(true)
  })

  it('blocks "weight loss" claim', () => {
    const draft = 'Proven for weight loss and a slimmer you.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(false)
    expect(result.blocked.length).toBeGreaterThan(0)
  })

  it('blocks "detox" claim with high severity', () => {
    const draft = 'This blend will detox your body and cleanse your system.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(false)
    expect(result.blocked.some(b => b.severity === 'high')).toBe(true)
  })

  it('blocks "boosts immunity" (without "clinically proven") with high severity', () => {
    const draft = 'Eat daily and it boosts immunity naturally.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(false)
    expect(result.blocked.some(b => b.severity === 'high')).toBe(true)
  })

  it('blocks "proven to" phrasing when not tied to an approved claim', () => {
    const draft = 'Our formula is proven to improve energy levels overnight.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(false)
  })

  it('blocks "sustainably sourced" when the matching claim is pending (not approved)', () => {
    const pendingClaim = makeClaim({
      id: 'sus-claim',
      claim_text: 'sustainably sourced',
      claim_type: 'sustainability',
      approval_status: 'pending',
      evidence: 'Audit in progress',
    })
    const draft = 'Our ingredients are sustainably sourced from local farms.'
    const result = validateClaims(draft, [pendingClaim])

    expect(result.ok).toBe(false)
    const sustainabilityBlocked = result.blocked.find(b =>
      b.phrase.toLowerCase().includes('sustainably sourced') ||
      b.reason.toLowerCase().includes('sustain')
    )
    expect(sustainabilityBlocked).toBeDefined()
    expect(sustainabilityBlocked!.severity).toBe('medium')
  })

  it('does NOT block plain descriptive copy (rich, spicy flavor)', () => {
    const draft = 'Enjoy our rich, spicy flavor with every bite. A warm, bold taste.'
    const result = validateClaims(draft, [])

    expect(result.ok).toBe(true)
    expect(result.blocked).toHaveLength(0)
  })

  it('does NOT block approved+evidenced claim even if it matches a denylist pattern', () => {
    // "boosts immunity" is on the denylist, but if backed by evidence -> no block
    const claim = makeClaim({
      id: 'immunity-claim',
      claim_text: 'boosts immunity',
      approval_status: 'approved',
      evidence: 'Double-blind RCT #2023-IMM, published J. Nutrition',
    })
    const draft = 'Our daily supplement boosts immunity as shown in clinical research.'
    const result = validateClaims(draft, [claim])

    expect(result.blocked).toHaveLength(0)
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. validateClaims — sanitizedText
// ---------------------------------------------------------------------------

describe('validateClaims — sanitizedText', () => {
  it('removes the offending sentence and keeps the rest', () => {
    const draft =
      'We source the finest ingredients. Our product is clinically proven to cure disease. Enjoy responsibly.'
    const result = validateClaims(draft, [])

    expect(result.sanitizedText).toContain('We source the finest ingredients')
    expect(result.sanitizedText).toContain('Enjoy responsibly')
    expect(result.sanitizedText).not.toMatch(/clinically proven to cure disease/i)
    expect(result.sanitizedText).toContain('[CLAIM REMOVED: needs approved evidence]')
  })

  it('clean draft with only approved+evidenced phrases has unchanged sanitizedText', () => {
    const claim = makeClaim({
      id: 'c1',
      claim_text: 'cold-pressed and unfiltered',
      approval_status: 'approved',
      evidence: 'Process audit #PA-2024',
    })
    const draft = 'Our oil is cold-pressed and unfiltered for maximum freshness.'
    const result = validateClaims(draft, [claim])

    expect(result.ok).toBe(true)
    expect(result.sanitizedText).toBe(draft)
  })

  it('empty draft returns ok true, empty arrays, empty sanitizedText', () => {
    const result = validateClaims('', [])

    expect(result.ok).toBe(true)
    expect(result.citations).toHaveLength(0)
    expect(result.blocked).toHaveLength(0)
    expect(result.sanitizedText).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 5. claimsForType
// ---------------------------------------------------------------------------

describe('claimsForType', () => {
  it('returns only claims matching the given claim_type', () => {
    const claims: Claim[] = [
      makeClaim({ id: 'c1', claim_type: 'health' }),
      makeClaim({ id: 'c2', claim_type: 'ingredient' }),
      makeClaim({ id: 'c3', claim_type: 'health' }),
      makeClaim({ id: 'c4', claim_type: null }),
    ]
    const result = claimsForType(claims, 'health')
    expect(result).toHaveLength(2)
    expect(result.map(c => c.id)).toEqual(['c1', 'c3'])
  })

  it('returns empty array when no claims match', () => {
    const claims = [makeClaim({ claim_type: 'ingredient' })]
    expect(claimsForType(claims, 'sustainability')).toHaveLength(0)
  })

  it('returns empty array for empty claims input', () => {
    expect(claimsForType([], 'health')).toHaveLength(0)
  })

  it('excludes claims with null claim_type', () => {
    const claims = [makeClaim({ claim_type: null })]
    expect(claimsForType(claims, 'health')).toHaveLength(0)
  })
})
