/**
 * Content & Campaign Engine data loader (Module 4).
 *
 * `loadContent(supabase, orgId)` fetches campaigns, content_assets, and the
 * org's claims in parallel. It derives:
 *
 *   - calendarRows   — campaigns sorted by start_date with channel, objective,
 *                      spend, date range, and target product name.
 *   - assetRows      — content_assets enriched with linked claim_text, campaign
 *                      channel, creator, and computed performance metrics
 *                      (CTR = clicks/impressions, ROAS = revenue/spend).
 *   - trackerRows    — per-asset rows for the creative-test tracker:
 *                      hook/angle, channel, spend, CTR, ROAS, and a
 *                      contribution-margin-aware note when revenue is present.
 *   - approvedClaims — claims with approval_status='approved', ready to cite.
 *   - kpis           — aggregate KPIs (campaign count, total ad spend, blended
 *                      ROAS, asset count).
 *
 * All divide-by-zero paths return null (never NaN). Spend without attributable
 * revenue is represented honestly — ROAS stays null and the UI surfaces an
 * "attribution pending" note rather than implying ROAS 0.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Campaign, ContentAsset, Claim, Product } from "@/lib/types";

// =============================================================================
// Performance sub-shape (content_assets.performance jsonb)
// =============================================================================

/** Raw performance columns stored in `content_assets.performance` jsonb. */
interface RawPerformance {
  impressions?: number | null;
  clicks?: number | null;
  spend?: number | null;
  revenue?: number | null;
}

/** Parsed + derived performance with divide-by-zero guards. */
export interface AssetPerformance {
  impressions: number | null;
  clicks: number | null;
  spend: number | null;
  revenue: number | null;
  /** clicks / impressions — null when impressions is null or 0. */
  ctr: number | null;
  /**
   * revenue / spend — null when spend is null, 0, or there is no attributable
   * revenue (ad platform not connected). The distinction between "spend=0" and
   * "spend>0 but revenue not yet attributed" is captured by `attributionPending`.
   */
  roas: number | null;
  /**
   * True when spend > 0 but revenue is null/0, indicating the ad platform has
   * not been connected and ROAS cannot be computed honestly.
   */
  attributionPending: boolean;
}

// =============================================================================
// Exported row types
// =============================================================================

/** Campaign row enriched for the calendar/timeline view. */
export interface CampaignCalendarRow {
  id: string;
  channel: string | null;
  objective: string | null;
  spend: number | null;
  startDate: string | null;
  endDate: string | null;
  targetProductName: string | null;
  /** True when the campaign is active (today falls within start/end range). */
  isActive: boolean;
}

/** Content asset row enriched for the asset library + tracker. */
export interface AssetRow {
  id: string;
  assetType: string | null;
  angle: string | null;
  /** Claim text from the linked claim row, or null when no claim is linked. */
  claimText: string | null;
  /** Channel from the linked campaign, or null. */
  channel: string | null;
  creator: string | null;
  performance: AssetPerformance;
  /** True when this is the best-performing asset by ROAS (first in sorted list). */
  isBestPerformer: boolean;
}

/** Row in the creative-test tracker table. */
export interface TrackerRow {
  id: string;
  angle: string | null;
  assetType: string | null;
  channel: string | null;
  spend: number | null;
  ctr: number | null;
  roas: number | null;
  attributionPending: boolean;
  /** Human-readable note surfacing contribution-margin context when revenue exists. */
  performanceNote: string | null;
}

/** Approved, citable claims available to the content studio. */
export interface ApprovedClaim {
  id: string;
  claimText: string;
  claimType: string | null;
  riskLevel: string;
}

/** KPI aggregates for the page header row. */
export interface ContentKpis {
  activeCampaignCount: number;
  totalAdSpend: number;
  /**
   * Blended ROAS across all assets with both spend > 0 and revenue > 0.
   * Null when no such assets exist (prevents false ROAS 0).
   */
  blendedRoas: number | null;
  assetCount: number;
}

/** Full content read model returned by `loadContent`. */
export interface ContentData {
  calendarRows: CampaignCalendarRow[];
  assetRows: AssetRow[];
  trackerRows: TrackerRow[];
  approvedClaims: ApprovedClaim[];
  kpis: ContentKpis;
}

// =============================================================================
// Internal helpers
// =============================================================================

function parsePerformance(raw: unknown): AssetPerformance {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as RawPerformance;

  const impressions = typeof p.impressions === "number" ? p.impressions : null;
  const clicks = typeof p.clicks === "number" ? p.clicks : null;
  const spend = typeof p.spend === "number" ? p.spend : null;
  const revenue = typeof p.revenue === "number" ? p.revenue : null;

  const ctr =
    impressions != null && impressions > 0 && clicks != null
      ? clicks / impressions
      : null;

  // ROAS only when spend > 0 and revenue is a real positive number.
  const hasSpend = spend != null && spend > 0;
  const hasRevenue = revenue != null && revenue > 0;
  const roas = hasSpend && hasRevenue ? revenue / spend : null;

  // Attribution is pending when spend exists but revenue is absent/zero (ad
  // platform not yet connected — do NOT imply ROAS 0).
  const attributionPending = hasSpend && !hasRevenue;

  return { impressions, clicks, spend, revenue, ctr, roas, attributionPending };
}

/** Naive "today" date string (YYYY-MM-DD) for active-campaign check. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isActiveCampaign(
  startDate: string | null,
  endDate: string | null,
): boolean {
  const today = todayIso();
  if (!startDate) return false;
  if (startDate > today) return false;
  if (endDate && endDate < today) return false;
  return true;
}

/**
 * Build a human-readable performance note for the tracker. Only rendered when
 * revenue data is present — avoids misleading commentary when attribution is
 * pending.
 */
function buildPerformanceNote(perf: AssetPerformance): string | null {
  if (!perf.revenue || !perf.roas) return null;
  if (perf.roas >= 3) {
    return `Strong ROAS ${perf.roas.toFixed(1)}× — consider scaling spend.`;
  }
  if (perf.roas >= 1) {
    return `Profitable at ${perf.roas.toFixed(1)}× ROAS — monitor margin before scaling.`;
  }
  return `ROAS below breakeven (${perf.roas.toFixed(1)}×) — review angle or creative.`;
}

// =============================================================================
// Main loader
// =============================================================================

export async function loadContent(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ContentData> {
  // Fetch campaigns, content_assets, products, and claims in parallel.
  const [campaignsRes, assetsRes, productsRes, claimsRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*")
      .eq("organization_id", orgId)
      .order("start_date", { ascending: true }),

    supabase
      .from("content_assets")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),

    supabase
      .from("products")
      .select("id, name")
      .eq("organization_id", orgId),

    supabase
      .from("claims")
      .select("*")
      .eq("organization_id", orgId),
  ]);

  if (campaignsRes.error) {
    throw new Error(`[content] campaigns read failed: ${campaignsRes.error.message}`);
  }
  if (assetsRes.error) {
    throw new Error(`[content] content_assets read failed: ${assetsRes.error.message}`);
  }
  if (productsRes.error) {
    throw new Error(`[content] products read failed: ${productsRes.error.message}`);
  }
  if (claimsRes.error) {
    throw new Error(`[content] claims read failed: ${claimsRes.error.message}`);
  }

  const campaigns = (campaignsRes.data ?? []) as Campaign[];
  const assets = (assetsRes.data ?? []) as ContentAsset[];
  const products = (productsRes.data ?? []) as Pick<Product, "id" | "name">[];
  const claims = (claimsRes.data ?? []) as Claim[];

  // Build lookup maps.
  const productNameById = new Map<string, string | null>();
  for (const p of products) {
    productNameById.set(p.id, p.name ?? null);
  }

  const claimTextById = new Map<string, string>();
  for (const c of claims) {
    claimTextById.set(c.id, c.claim_text);
  }

  const campaignChannelById = new Map<string, string | null>();
  for (const c of campaigns) {
    campaignChannelById.set(c.id, c.channel ?? null);
  }

  // ── Calendar rows ──
  const calendarRows: CampaignCalendarRow[] = campaigns.map((c) => ({
    id: c.id,
    channel: c.channel,
    objective: c.objective,
    spend: c.spend,
    startDate: c.start_date,
    endDate: c.end_date,
    targetProductName: c.target_product_id
      ? (productNameById.get(c.target_product_id) ?? null)
      : null,
    isActive: isActiveCampaign(c.start_date, c.end_date),
  }));

  // ── Asset rows (pre-enriched) ──
  const enrichedAssets = assets.map((a) => {
    const perf = parsePerformance(a.performance);
    return {
      id: a.id,
      assetType: a.asset_type,
      angle: a.angle,
      claimText: a.claim_id ? (claimTextById.get(a.claim_id) ?? null) : null,
      channel: a.campaign_id
        ? (campaignChannelById.get(a.campaign_id) ?? null)
        : null,
      creator: a.creator,
      performance: perf,
      // isBestPerformer tagged below after sorting
      isBestPerformer: false,
    };
  });

  // Determine best performer by ROAS (only among assets with computed ROAS).
  const withRoas = enrichedAssets
    .filter((a) => a.performance.roas !== null)
    .sort((a, b) => (b.performance.roas ?? 0) - (a.performance.roas ?? 0));

  const bestId = withRoas[0]?.id ?? null;
  const assetRows: AssetRow[] = enrichedAssets.map((a) => ({
    ...a,
    isBestPerformer: a.id === bestId,
  }));

  // ── Tracker rows ──
  const trackerRows: TrackerRow[] = assetRows.map((a) => ({
    id: a.id,
    angle: a.angle,
    assetType: a.assetType,
    channel: a.channel,
    spend: a.performance.spend,
    ctr: a.performance.ctr,
    roas: a.performance.roas,
    attributionPending: a.performance.attributionPending,
    performanceNote: buildPerformanceNote(a.performance),
  }));

  // ── Approved claims ──
  const approvedClaims: ApprovedClaim[] = claims
    .filter((c) => c.approval_status === "approved")
    .map((c) => ({
      id: c.id,
      claimText: c.claim_text,
      claimType: c.claim_type,
      riskLevel: c.risk_level,
    }));

  // ── KPIs ──
  const activeCampaignCount = calendarRows.filter((c) => c.isActive).length;

  const totalAdSpend = campaigns.reduce((sum, c) => sum + (c.spend ?? 0), 0);

  // Blended ROAS: total revenue / total spend — only across assets with both.
  let totalRevenue = 0;
  let totalSpendForRoas = 0;
  for (const a of assetRows) {
    const { spend, revenue } = a.performance;
    if (spend && spend > 0 && revenue && revenue > 0) {
      totalSpendForRoas += spend;
      totalRevenue += revenue;
    }
  }
  const blendedRoas =
    totalSpendForRoas > 0 ? totalRevenue / totalSpendForRoas : null;

  const kpis: ContentKpis = {
    activeCampaignCount,
    totalAdSpend,
    blendedRoas,
    assetCount: assets.length,
  };

  return { calendarRows, assetRows, trackerRows, approvedClaims, kpis };
}
