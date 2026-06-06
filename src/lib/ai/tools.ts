/**
 * NourishOS AI — Tool definitions and dispatcher.
 *
 * Exports:
 *   AI_TOOLS   — Anthropic tool definitions passed to the messages API.
 *   runTool    — Server-side dispatcher: executes a named tool against the
 *                brand's Supabase data and returns a JSON string result.
 *
 * Security: ALL queries are filtered by the caller-supplied orgId.
 * createServiceClient() bypasses RLS, so the orgId filter is the only
 * isolation boundary — never omit it.
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { marginByChannel, marginByCampaign } from "@/lib/domain/margin";
import type { Product, ProductTruthRecord, Claim, Order, OrderLine, Campaign } from "@/lib/types";

// =============================================================================
// Tool definitions
// =============================================================================

export const AI_TOOLS: Anthropic.Tool[] = [
  {
    name: "lookup_product_truth",
    description:
      "Call this to fetch the brand's APPROVED product facts (ingredients, allergens, nutrition, serving size) for a product. Use this before stating any ingredient, allergen, or nutrition fact — never state these from memory. If product_name is omitted, returns truth records for all org products.",
    input_schema: {
      type: "object" as const,
      properties: {
        product_name: {
          type: "string",
          description:
            "Optional product name to look up (case-insensitive partial match). Omit to fetch truth records for all org products.",
        },
      },
      required: [],
    },
  },
  {
    name: "check_claim",
    description:
      "Call this to check whether a marketing/health/ingredient claim is approved and evidenced before using it. Returns the claim's approval_status, evidence, and risk_level. If no matching claim exists on record, the response will indicate found:false — do not state that claim.",
    input_schema: {
      type: "object" as const,
      properties: {
        claim_text: {
          type: "string",
          description: "The claim text to look up (case-insensitive, partial match).",
        },
      },
      required: ["claim_text"],
    },
  },
  {
    name: "get_metrics",
    description:
      "Call this to get the brand's contribution margin, revenue, and channel/campaign performance for the trailing 60 days. Use for any question about profitability, margin, AOV, channels, or campaigns.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// =============================================================================
// Input shapes (narrowed from `unknown`)
// =============================================================================

interface LookupProductTruthInput {
  product_name?: string;
}

interface CheckClaimInput {
  claim_text: string;
}

// get_metrics takes no input

function isLookupProductTruthInput(v: unknown): v is LookupProductTruthInput {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return obj["product_name"] === undefined || typeof obj["product_name"] === "string";
}

function isCheckClaimInput(v: unknown): v is CheckClaimInput {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj["claim_text"] === "string";
}

// =============================================================================
// Tool handlers
// =============================================================================

async function handleLookupProductTruth(
  input: unknown,
  orgId: string,
): Promise<string> {
  if (!isLookupProductTruthInput(input)) {
    return JSON.stringify({ error: "Invalid input: expected { product_name?: string }" });
  }

  const supabase = createServiceClient();

  // Fetch products for the org, optionally filtered by name
  let productsQuery = supabase
    .from("products")
    .select("*")
    .eq("organization_id", orgId);

  if (input.product_name) {
    productsQuery = productsQuery.ilike("name", `%${input.product_name}%`);
  }

  const { data: products, error: productsError } = await productsQuery;
  if (productsError) {
    return JSON.stringify({ error: `DB error (products): ${productsError.message}` });
  }
  if (!products || products.length === 0) {
    return JSON.stringify({
      found: false,
      note: input.product_name
        ? `No product matching "${input.product_name}" found for this organisation.`
        : "No products found for this organisation.",
    });
  }

  const typedProducts = products as Product[];
  const productIds = typedProducts.map((p) => p.id);

  // Fetch truth records for those products
  const { data: truthRecords, error: truthError } = await supabase
    .from("product_truth_records")
    .select("*")
    .eq("organization_id", orgId)
    .in("product_id", productIds);

  if (truthError) {
    return JSON.stringify({ error: `DB error (product_truth_records): ${truthError.message}` });
  }

  const typedTruth = (truthRecords ?? []) as ProductTruthRecord[];

  // Join products with their truth records
  const result = typedProducts.map((product) => {
    const truth = typedTruth.filter((t) => t.product_id === product.id);
    return {
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      status: product.status,
      truth_records: truth.map((t) => ({
        id: t.id,
        version: t.version,
        approval_status: t.approval_status,
        ingredients: t.ingredients,
        allergens: t.allergens,
        serving_size: t.serving_size,
        net_weight: t.net_weight,
        nutrition_file_path: t.nutrition_file_path,
      })),
    };
  });

  return JSON.stringify({ found: true, products: result });
}

async function handleCheckClaim(input: unknown, orgId: string): Promise<string> {
  if (!isCheckClaimInput(input)) {
    return JSON.stringify({ error: "Invalid input: expected { claim_text: string }" });
  }

  const supabase = createServiceClient();

  // Search for the closest matching claim using ILIKE (case-insensitive contains)
  const { data: claims, error } = await supabase
    .from("claims")
    .select("*")
    .eq("organization_id", orgId)
    .ilike("claim_text", `%${input.claim_text}%`);

  if (error) {
    return JSON.stringify({ error: `DB error (claims): ${error.message}` });
  }

  if (!claims || claims.length === 0) {
    // Try reverse search: see if the stored claim contains the queried text
    const { data: reverseClaims, error: reverseError } = await supabase
      .from("claims")
      .select("*")
      .eq("organization_id", orgId);

    if (!reverseError && reverseClaims) {
      const typedReverse = reverseClaims as Claim[];
      const lower = input.claim_text.toLowerCase();
      const match = typedReverse.find((c) =>
        c.claim_text.toLowerCase().includes(lower),
      );
      if (match) {
        return JSON.stringify({
          found: true,
          claim_text: match.claim_text,
          approval_status: match.approval_status,
          evidence: match.evidence,
          risk_level: match.risk_level,
          claim_type: match.claim_type,
          channels_used: match.channels_used,
        });
      }
    }

    return JSON.stringify({
      found: false,
      queried_text: input.claim_text,
      note: "No matching approved claim on record. Do not state this claim.",
    });
  }

  // Return the best match (first result, already filtered by org)
  const typedClaims = claims as Claim[];
  const best = typedClaims[0];

  return JSON.stringify({
    found: true,
    claim_text: best.claim_text,
    approval_status: best.approval_status,
    evidence: best.evidence,
    risk_level: best.risk_level,
    claim_type: best.claim_type,
    channels_used: best.channels_used,
    additional_matches: typedClaims.length > 1 ? typedClaims.length - 1 : 0,
  });
}

async function handleGetMetrics(orgId: string): Promise<string> {
  const supabase = createServiceClient();

  // Trailing 60 days window
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const sinceIso = since.toISOString();

  // Fetch orders in the trailing 60 days
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("organization_id", orgId)
    .gte("ordered_at", sinceIso)
    .order("ordered_at", { ascending: true });

  if (ordersError) {
    return JSON.stringify({ error: `DB error (orders): ${ordersError.message}` });
  }

  const typedOrders = (orders ?? []) as Order[];

  // Fetch order lines for those orders
  const orderIds = typedOrders.map((o) => o.id);
  let typedLines: OrderLine[] = [];
  if (orderIds.length > 0) {
    const { data: lines, error: linesError } = await supabase
      .from("order_lines")
      .select("*")
      .eq("organization_id", orgId)
      .in("order_id", orderIds);
    if (linesError) {
      return JSON.stringify({ error: `DB error (order_lines): ${linesError.message}` });
    }
    typedLines = (lines ?? []) as OrderLine[];
  }

  // Build linesByOrderId index
  const linesByOrderId: Record<string, OrderLine[]> = {};
  for (const line of typedLines) {
    if (!line.order_id) continue;
    (linesByOrderId[line.order_id] ??= []).push(line);
  }

  // Fetch campaigns active in this window (start_date or end_date overlaps)
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", orgId)
    .gte("end_date", sinceIso);

  if (campaignsError) {
    return JSON.stringify({ error: `DB error (campaigns): ${campaignsError.message}` });
  }

  const typedCampaigns = (campaigns ?? []) as Campaign[];

  // Delegate math to the pure margin engine
  const byChannelRaw = marginByChannel(typedOrders, linesByOrderId);
  const byCampaign = marginByCampaign(typedOrders, linesByOrderId, typedCampaigns);

  const totalRevenue = byChannelRaw.reduce((s, r) => s + r.revenue, 0);
  const totalContributionMargin = byChannelRaw.reduce((s, r) => s + r.contributionMargin, 0);
  const blendedCmPct = totalRevenue > 0 ? totalContributionMargin / totalRevenue : null;

  // Enrich channel rows with AOV and CM%
  const byChannel = byChannelRaw.map((row) => ({
    ...row,
    aov: row.orders > 0 ? row.revenue / row.orders : 0,
    cmPct: row.revenue > 0 ? row.contributionMargin / row.revenue : 0,
  }));

  return JSON.stringify({
    windowDays: 60,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalContributionMargin: Math.round(totalContributionMargin * 100) / 100,
    blendedCmPct: blendedCmPct !== null ? Math.round(blendedCmPct * 10000) / 10000 : null,
    orderCount: typedOrders.length,
    byChannel,
    byCampaign,
  });
}

// =============================================================================
// Dispatcher
// =============================================================================

/**
 * Execute a Claude tool by name, grounded in the org's Supabase data.
 *
 * @param name   Tool name as returned by Claude in a tool_use block.
 * @param input  Tool input object as parsed from Claude's response.
 * @param orgId  Organization id — ALWAYS applied to every DB query.
 * @returns JSON string to send back as a tool_result content block.
 */
export async function runTool(
  name: string,
  input: unknown,
  orgId: string,
): Promise<string> {
  if (!orgId) {
    throw new Error("[runTool] orgId is required — service client bypasses RLS.");
  }

  switch (name) {
    case "lookup_product_truth":
      return handleLookupProductTruth(input, orgId);
    case "check_claim":
      return handleCheckClaim(input, orgId);
    case "get_metrics":
      return handleGetMetrics(orgId);
    default:
      throw new Error(`[runTool] Unknown tool: "${name}"`);
  }
}
