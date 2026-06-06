/**
 * Claim-to-evidence guardrail engine — PURE functions (no DB, no IO).
 *
 * This is the SAFETY-CRITICAL post-generation gate for NourishOS.
 * Purpose: given AI-drafted marketing text and a brand's approved claims,
 * BLOCK unsupported health/allergen/ingredient assertions and provide
 * citations for claims that are properly evidenced.
 *
 * Why this matters for an edible brand:
 *   - Unsubstantiated health claims violate FTC guidelines and FDA regulations
 *   - Allergen/ingredient misrepresentation is a product-recall trigger
 *   - "FDA-approved" / "clinically proven" language on food products is
 *     heavily regulated and almost always impermissible without explicit clearance
 *   - Sustainability claims ("sustainably sourced", "eco-friendly") without
 *     third-party audits are FTC Green Guide violations
 *
 * Approved-claim priority rule:
 *   If a denylist pattern fires BUT an approved+evidenced claim covers the same
 *   phrase, the claim wins — evidence exists, so blocking is unnecessary.
 *   This prevents over-blocking legitimate differentiation copy.
 *
 * Default posture: block on ambiguity. A borderline assertion with no
 * backing evidence is blocked; unblock by adding an approved claim with evidence.
 *
 * Reused by: AI orchestrator (Phase 5).
 */

import type { Claim } from '@/lib/types'

// =============================================================================
// Exported types
// =============================================================================

export interface ClaimCitation {
  claimId: string
  claimText: string
  evidence: string
}

export interface BlockedClaim {
  phrase: string
  reason: string
  severity: 'low' | 'medium' | 'high'
}

export interface GuardrailResult {
  /** true if no blocked claims were found */
  ok: boolean
  /** approved claims detected in the draft, with their evidence */
  citations: ClaimCitation[]
  /** risky assertions found in the draft that have no approved evidence */
  blocked: BlockedClaim[]
  /** draft with blocked sentences removed and replaced with a marker */
  sanitizedText: string
}

// =============================================================================
// Denylist — patterns that represent HIGH-RISK assertions for an edible brand
// =============================================================================

interface DenyEntry {
  pattern: RegExp
  reason: string
  severity: BlockedClaim['severity']
}

/**
 * Each entry explains WHY it is risky for an edible brand:
 *
 * HEALTH / MEDICAL claims (severity: high)
 * These imply clinical efficacy that requires FDA clearance or published RCTs.
 * Emitting them without evidence is an FTC/FDA violation for food brands.
 *
 * SUSTAINABILITY claims (severity: medium)
 * The FTC Green Guides require substantiation for environmental claims.
 * Vague claims like "sustainably sourced" without an audit are deceptive.
 */
const DENYLIST: DenyEntry[] = [
  // -------------------------------------------------------------------------
  // "Clinically proven" / "scientifically proven" — implies a controlled
  // clinical trial. Almost universally impermissible on food labels without
  // an actual published study. HIGH severity.
  // -------------------------------------------------------------------------
  {
    pattern: /clinically\s+(?:proven|tested|validated)/i,
    reason:
      '"Clinically proven" implies a controlled clinical trial; this requires an approved+evidenced claim backed by peer-reviewed research.',
    severity: 'high',
  },
  {
    pattern: /scientifically\s+proven/i,
    reason:
      '"Scientifically proven" suggests peer-reviewed evidence; only permissible when an approved claim with a cited study exists.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // Disease treatment / prevention claims — "cure", "treat", "prevent" in
  // the context of a disease are drug-class claims for food products and
  // trigger FDA enforcement. HIGH severity.
  // Allow up to 3 intervening words between the verb and the disease noun
  // so that "cure chronic illness" or "prevent serious disease" are caught.
  // -------------------------------------------------------------------------
  {
    pattern: /\b(?:cure|cures|cured|curing|treat|treats|treated|treating|prevent|prevents|prevented|preventing)(?:\s+\w+){0,3}\s+(?:disease|illness|covid|flu|cancer|diabetes|infection|disorder|condition)\b/i,
    reason:
      'Disease treatment/prevention claims classify a food product as a drug under FDA law; not permissible without drug approval.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // Immunity claims — "boosts immunity", "boosts your immune system" etc.
  // The FDA and FTC have specifically flagged these as commonly unsubstantiated
  // on food and supplement labels. HIGH severity.
  // -------------------------------------------------------------------------
  {
    pattern: /boost(?:s|ing|ed)?\s+(?:your\s+)?(?:immunity|immune\s+system)/i,
    reason:
      'Immunity-boosting claims require clinical substantiation; unsubstantiated immune claims are an FTC enforcement priority.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // "FDA-approved" — food products are generally not "FDA-approved" (drugs are).
  // Using this language on food is misleading and potentially illegal.
  // HIGH severity.
  // -------------------------------------------------------------------------
  {
    pattern: /FDA[- ]approved/i,
    reason:
      '"FDA-approved" is a designation for drugs, not food products; using it on food is misleading and may violate FTC/FDA rules.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // Weight-loss claims — "weight loss", "burn fat", "lose weight" require
  // substantiation under FTC guidelines. Unsubstantiated = deceptive.
  // HIGH severity.
  // -------------------------------------------------------------------------
  {
    pattern: /\bweight\s+loss\b/i,
    reason:
      'Weight loss claims require competent and reliable scientific evidence under FTC guidelines.',
    severity: 'high',
  },
  {
    pattern: /\bburn(?:s|ing)?\s+fat\b/i,
    reason:
      'Fat-burning claims are structure/function claims that require substantiation; high liability for food brands.',
    severity: 'high',
  },
  {
    pattern: /\blose\s+weight\b/i,
    reason:
      'Weight-reduction claims require FTC-compliant substantiation for edible products.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // Detox claims — "detox", "cleanse your system" have no established
  // scientific meaning for food products and are routinely flagged by the
  // FTC as unsubstantiated. HIGH severity.
  // -------------------------------------------------------------------------
  {
    pattern: /\bdetox(?:ify|ifying|ification)?\b/i,
    reason:
      '"Detox" claims are considered unsubstantiated for food products; the FTC and UK ASA both flag these regularly.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // "100% healthy/safe" — absolute safety claims cannot be substantiated
  // for any food product. HIGH severity.
  // -------------------------------------------------------------------------
  {
    pattern: /\b100\s*%\s+(?:healthy|safe)\b/i,
    reason:
      'Absolute safety/health claims ("100% healthy/safe") cannot be substantiated for any food product.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // Generic "proven to" — broad claim of proof without naming a claim that
  // is backed by an approved+evidenced entry. HIGH severity (catches residual).
  // -------------------------------------------------------------------------
  {
    pattern: /\bproven\s+to\b/i,
    reason:
      '"Proven to" asserts scientific/clinical proof; only permissible when an approved claim with published evidence exists.',
    severity: 'high',
  },

  // -------------------------------------------------------------------------
  // Sustainability claims — "sustainably sourced", "eco-friendly",
  // "carbon neutral", "zero waste" require third-party audit substantiation
  // under the FTC Green Guides. MEDIUM severity (less acute than health claims
  // but still a material compliance risk).
  // -------------------------------------------------------------------------
  {
    pattern: /\bsustainably?\s+sourced\b/i,
    reason:
      '"Sustainably sourced" requires a third-party audit or certification under FTC Green Guides; unsubstantiated = deceptive advertising.',
    severity: 'medium',
  },
  {
    pattern: /\beco[- ]friendly\b/i,
    reason:
      '"Eco-friendly" is a broad environmental claim that requires substantiation under FTC Green Guides.',
    severity: 'medium',
  },
  {
    pattern: /\bcarbon[- ]neutral\b/i,
    reason:
      '"Carbon neutral" requires verified lifecycle assessments and third-party certification.',
    severity: 'medium',
  },
  {
    pattern: /\bzero[- ]waste\b/i,
    reason:
      '"Zero waste" is an absolute environmental claim; requires independent verification.',
    severity: 'medium',
  },
]

// =============================================================================
// Utility helpers
// =============================================================================

/**
 * Normalise whitespace in a string for consistent matching.
 * Collapses multiple spaces/tabs/newlines to a single space and trims.
 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Split text into sentences. Handles common sentence-ending punctuation.
 * Returns an array of { sentence, start, end } for reconstruction.
 */
function splitSentences(text: string): Array<{ sentence: string; start: number; end: number }> {
  const results: Array<{ sentence: string; start: number; end: number }> = []
  // Match sequences that end with . ! ? or end-of-string
  const pattern = /[^.!?]*(?:[.!?]|$)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0]
    if (raw.trim().length === 0) continue
    results.push({ sentence: raw, start: match.index, end: match.index + raw.length })
    if (match.index + raw.length >= text.length) break
  }
  return results
}

/**
 * Extract the "distinctive keywords" from a claim_text for keyword-based
 * paraphrase matching. Filters out stop words and short tokens.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'our', 'we', 'it', 'its', 'as', 'this', 'that', 'these', 'those',
])

function distinctiveKeywords(claimText: string): string[] {
  return claimText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

// =============================================================================
// 1. approvedClaimPhrases
// =============================================================================

/**
 * Return only claims that are:
 *   (a) approval_status === 'approved'
 *   (b) have non-empty evidence (null or '' is NOT citable)
 *
 * An approved claim without evidence cannot be cited — there is nothing to
 * back up the assertion. Both conditions must be true.
 */
export function approvedClaimPhrases(claims: Claim[]): Claim[] {
  return claims.filter(
    c => c.approval_status === 'approved' && c.evidence !== null && c.evidence !== '',
  )
}

// =============================================================================
// 2. validateClaims — the core guardrail gate
// =============================================================================

/**
 * Validate AI-drafted text against a brand's claims.
 *
 * Algorithm:
 *  1. Gather the approved+evidenced claims (citable set).
 *  2. For each citable claim, check if the draft mentions it (verbatim or
 *     keyword-keyed paraphrase). If so, add a ClaimCitation.
 *  3. Run every denylist pattern against each sentence of the draft. If a
 *     pattern fires AND no citable claim covers the matching text, add a
 *     BlockedClaim and flag that sentence for removal.
 *  4. Rebuild sanitizedText by replacing flagged sentences with the marker.
 *  5. ok = blocked.length === 0.
 */
export function validateClaims(draftText: string, claims: Claim[]): GuardrailResult {
  if (!draftText.trim()) {
    return { ok: true, citations: [], blocked: [], sanitizedText: '' }
  }

  const citable = approvedClaimPhrases(claims)
  const citations: ClaimCitation[] = []
  const blocked: BlockedClaim[] = []
  const normalizedDraft = normalizeWhitespace(draftText)
  const lowerDraft = normalizedDraft.toLowerCase()

  // -------------------------------------------------------------------------
  // Step 1: citation detection
  // -------------------------------------------------------------------------
  // A cited claim must appear verbatim (case-insensitive, whitespace-normalised)
  // OR via keyword overlap (all distinctive keywords present in the draft).
  // -------------------------------------------------------------------------
  for (const claim of citable) {
    const normalizedClaimText = normalizeWhitespace(claim.claim_text).toLowerCase()

    const verbatimMatch = lowerDraft.includes(normalizedClaimText)

    // Keyword-based paraphrase: all distinctive keywords from the claim appear in the draft
    const keywords = distinctiveKeywords(claim.claim_text)
    const keywordMatch =
      keywords.length > 0 && keywords.every(kw => lowerDraft.includes(kw))

    if (verbatimMatch || keywordMatch) {
      citations.push({
        claimId: claim.id,
        claimText: claim.claim_text,
        // evidence is guaranteed non-null/non-empty because approvedClaimPhrases filters it
        evidence: claim.evidence as string,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Build a set of claim phrases that are covered by approved+evidenced claims.
  // Any denylist match whose matched text falls entirely within a covered phrase
  // is exempt from blocking (approved claims win over the denylist).
  // -------------------------------------------------------------------------
  const coveredPhrases: string[] = citable.map(c =>
    normalizeWhitespace(c.claim_text).toLowerCase(),
  )
  // Also gather the keywords for each citable claim so we can check coverage
  const coveredKeywordSets: string[][] = citable.map(c => distinctiveKeywords(c.claim_text))

  /** Return true if the denylist match occurs inside an approved+evidenced claim. */
  function isApprovedContext(matchedText: string): boolean {
    const lowerMatch = matchedText.toLowerCase().trim()

    // Verbatim: the matched text is a substring of a covered claim phrase
    for (const phrase of coveredPhrases) {
      if (phrase.includes(lowerMatch) || lowerMatch.includes(phrase)) return true
    }
    // Keyword: all keywords from any citable claim appear in the matched text
    for (const keywords of coveredKeywordSets) {
      if (keywords.length > 0 && keywords.every(kw => lowerMatch.includes(kw))) return true
    }
    return false
  }

  // -------------------------------------------------------------------------
  // Step 2: sentence-level denylist scanning
  // -------------------------------------------------------------------------
  const sentences = splitSentences(normalizedDraft)
  const blockedSentenceIndices = new Set<number>()

  for (let i = 0; i < sentences.length; i++) {
    const { sentence } = sentences[i]
    const lowerSentence = sentence.toLowerCase()

    for (const entry of DENYLIST) {
      const match = entry.pattern.exec(lowerSentence)
      if (match === null) continue

      const matchedPhrase = match[0]

      // Approved+evidenced claim covers this phrase — do NOT block
      if (isApprovedContext(lowerSentence)) continue

      // Record the blocked claim (deduplicate by phrase within this call)
      const alreadyBlocked = blocked.some(
        b => b.phrase.toLowerCase() === matchedPhrase.toLowerCase().trim(),
      )
      if (!alreadyBlocked) {
        blocked.push({
          phrase: matchedPhrase.trim(),
          reason: entry.reason,
          severity: entry.severity,
        })
      }
      blockedSentenceIndices.add(i)
      // No break — a single sentence might match multiple denylist entries
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: rebuild sanitizedText
  // -------------------------------------------------------------------------
  let sanitizedText: string
  if (blockedSentenceIndices.size === 0) {
    sanitizedText = draftText
  } else {
    // Replace each blocked sentence with the marker, preserving surrounding text
    const parts: string[] = []
    for (let i = 0; i < sentences.length; i++) {
      if (blockedSentenceIndices.has(i)) {
        parts.push('[CLAIM REMOVED: needs approved evidence]')
      } else {
        parts.push(sentences[i].sentence.trim())
      }
    }
    sanitizedText = parts.join(' ').trim()
  }

  return {
    ok: blocked.length === 0,
    citations,
    blocked,
    sanitizedText,
  }
}

// =============================================================================
// 3. claimsForType — convenience filter used by callers
// =============================================================================

/**
 * Return all claims whose claim_type matches the given type string.
 * Claims with null claim_type are excluded.
 * Used by the AI orchestrator to narrow claims to a relevant category
 * (e.g. 'health', 'ingredient', 'sustainability') before passing to validateClaims.
 */
export function claimsForType(claims: Claim[], type: string): Claim[] {
  return claims.filter(c => c.claim_type === type)
}
