/**
 * Zod validation schemas — shared input contracts for Server Actions.
 *
 * Each schema models the *parsed* shape an action expects after pulling values
 * out of a FormData payload. Keeping these here (rather than inline in the
 * actions) lets multiple modules reuse the same coercion rules and keeps the
 * action files thin.
 *
 * Conventions:
 *  - Comma-delimited free-text lists (ingredients, allergens, channels) come in
 *    as a single string from a text input; `commaList` splits + trims + drops
 *    empties so the DB always receives a clean `string[]`.
 *  - Optional text fields normalise "" → null so we never store empty strings.
 */

import { z } from "zod";

/**
 * Split a comma-separated string into a trimmed, de-duplicated, non-empty list.
 * Accepts undefined/empty → [].
 */
export function parseCommaList(input: string | null | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const value = raw.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/** "" / whitespace-only → null; otherwise the trimmed string. */
const optionalText = z
  .string()
  .transform((v) => {
    const t = v.trim();
    return t.length === 0 ? null : t;
  })
  .nullable()
  .default(null);

/** A required UUID (product/claim/record ids coming from the form). */
const uuid = z.string().uuid("Expected a valid id.");

// =============================================================================
// Truth record
// =============================================================================

export const truthRecordApprovalStatuses = ["draft", "pending", "approved"] as const;

/**
 * Input for `updateTruthRecord`. `ingredients`/`allergens` arrive as raw comma
 * strings and are normalised into string arrays by the action before insert.
 */
export const truthRecordSchema = z.object({
  productId: uuid,
  /** Existing record id, when updating; absent → create a new record. */
  recordId: z.string().uuid().optional(),
  ingredients: z.array(z.string().min(1)).default([]),
  allergens: z.array(z.string().min(1)).default([]),
  servingSize: optionalText,
  netWeight: optionalText,
  approvalStatus: z.enum(truthRecordApprovalStatuses),
  /** Storage object path written by an upload, if any (else keep existing). */
  nutritionFilePath: optionalText,
});

export type TruthRecordInput = z.infer<typeof truthRecordSchema>;

// =============================================================================
// Claim
// =============================================================================

export const claimApprovalStatuses = ["pending", "approved", "rejected"] as const;
export const claimRiskLevels = ["low", "medium", "high"] as const;

/**
 * Input for `upsertClaim`. When `claimId` is present we update that claim;
 * otherwise we insert a new one. `channelsUsed` arrives as a comma string and
 * is normalised by the action.
 */
export const claimSchema = z.object({
  productId: uuid,
  claimId: z.string().uuid().optional(),
  claimText: z.string().trim().min(1, "Claim text is required."),
  claimType: optionalText,
  evidence: optionalText,
  approvalStatus: z.enum(claimApprovalStatuses),
  riskLevel: z.enum(claimRiskLevels),
  channelsUsed: z.array(z.string().min(1)).default([]),
});

export type ClaimInput = z.infer<typeof claimSchema>;
