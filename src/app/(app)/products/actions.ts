"use server";

/**
 * Server Actions for the Product & Compliance Vault (Module 2).
 *
 *   updateTruthRecord — create or update a product's truth record (ingredients,
 *     allergens, serving size, net weight, approval status) plus optional
 *     nutrition / label-artwork file uploads to the private `files` bucket.
 *   upsertClaim       — create or update a marketing claim (text, type,
 *     evidence, approval status, risk level, channels used).
 *
 * Both run through the cookie-aware Supabase client so RLS is enforced as the
 * signed-in user, validate their input with Zod, write an `audit_log` row on
 * success, and `revalidatePath` the product detail page. On failure they return
 * a typed `{ ok: false, error }` the client form surfaces (they never throw for
 * expected validation / write errors).
 *
 * Storage convention: uploads go to `files` under `${orgId}/${productId}/...`.
 */

import { revalidatePath } from "next/cache";

import { requireOrg } from "@/lib/data/org";
import { createServiceClient } from "@/lib/supabase/server";
import {
  truthRecordSchema,
  claimSchema,
  parseCommaList,
} from "@/lib/validation";

// =============================================================================
// Result type
// =============================================================================

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

const STORAGE_BUCKET = "files";

/** Allowed upload MIME types for compliance artwork / nutrition panels. */
const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Max upload size (10 MB) — keeps a stray multi-hundred-MB file out of storage. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// =============================================================================
// Helpers
// =============================================================================

/** Read a FormData string value, returning "" when absent. */
function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

/** True when a FormData entry is a non-empty uploaded file. */
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

/**
 * Upload one compliance file to `files` under `${orgId}/${productId}/<kind>-...`.
 * Returns the stored object path on success, or an error string on failure.
 */
async function uploadComplianceFile(
  supabase: ReturnType<typeof createServiceClient>,
  orgId: string,
  productId: string,
  kind: string,
  file: File,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `${kind} file exceeds the 10 MB limit.` };
  }
  if (file.type && !ALLOWED_UPLOAD_TYPES.has(file.type)) {
    return {
      ok: false,
      error: `${kind} file type not allowed (use PDF, PNG, JPEG, or WebP).`,
    };
  }

  // Stable-ish but unique path: kind + timestamp + sanitised original name.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${orgId}/${productId}/${kind}-${Date.now()}-${safeName}`;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) {
    return { ok: false, error: `Upload failed: ${error.message}` };
  }
  return { ok: true, path };
}

/** Best-effort audit insert. Never throws — a failed audit must not fail a save. */
async function writeAudit(
  supabase: ReturnType<typeof createServiceClient>,
  params: {
    orgId: string;
    actor: string;
    entity: "product_truth_record" | "claim";
    entityId: string;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    organization_id: params.orgId,
    actor: params.actor,
    entity: params.entity,
    entity_id: params.entityId,
    field: params.field,
    old_value: params.oldValue == null ? null : JSON.stringify(params.oldValue),
    new_value: params.newValue == null ? null : JSON.stringify(params.newValue),
  });
  if (error) {
    // Log server-side; the user's save already succeeded.
    console.error("[products] audit_log insert failed:", error.message);
  }
}

// =============================================================================
// updateTruthRecord
// =============================================================================

export async function updateTruthRecord(form: FormData): Promise<ActionResult> {
  const { userId, org } = await requireOrg();
  const supabase = createServiceClient();

  // Parse + validate the relational fields (uploads handled separately).
  const parsed = truthRecordSchema.safeParse({
    productId: str(form, "productId"),
    recordId: str(form, "recordId") || undefined,
    ingredients: parseCommaList(str(form, "ingredients")),
    allergens: parseCommaList(str(form, "allergens")),
    servingSize: str(form, "servingSize"),
    netWeight: str(form, "netWeight"),
    approvalStatus: str(form, "approvalStatus"),
    nutritionFilePath: str(form, "nutritionFilePath") || "",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  // Confirm the product belongs to the caller's org (defence-in-depth on top of RLS).
  const productRes = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", input.productId)
    .maybeSingle();
  if (productRes.error) {
    return { ok: false, error: `Could not load product: ${productRes.error.message}` };
  }
  if (!productRes.data) {
    return { ok: false, error: "Product not found." };
  }

  // Handle optional uploads. nutrition → tracked on the record; label artwork is
  // stored for the AI/content modules (path captured in the audit trail).
  let nutritionFilePath: string | null = input.nutritionFilePath;
  const nutritionFile = form.get("nutritionFile");
  if (isUploadedFile(nutritionFile)) {
    const up = await uploadComplianceFile(
      supabase,
      org.id,
      input.productId,
      "nutrition",
      nutritionFile,
    );
    if (!up.ok) return { ok: false, error: up.error };
    nutritionFilePath = up.path;
  }

  let labelArtworkPath: string | null = null;
  const labelFile = form.get("labelFile");
  if (isUploadedFile(labelFile)) {
    const up = await uploadComplianceFile(
      supabase,
      org.id,
      input.productId,
      "label",
      labelFile,
    );
    if (!up.ok) return { ok: false, error: up.error };
    labelArtworkPath = up.path;
  }

  // Build the row payload. Label artwork path is appended into ingredients-free
  // metadata via the audit log only (no dedicated column), so we record it there.
  const recordPayload = {
    organization_id: org.id,
    product_id: input.productId,
    ingredients: input.ingredients,
    allergens: input.allergens,
    serving_size: input.servingSize,
    net_weight: input.netWeight,
    nutrition_file_path: nutritionFilePath,
    approval_status: input.approvalStatus,
    updated_at: new Date().toISOString(),
  };

  let recordId = input.recordId ?? null;

  if (recordId) {
    const { error } = await supabase
      .from("product_truth_records")
      .update(recordPayload)
      .eq("id", recordId)
      .eq("organization_id", org.id);
    if (error) {
      return { ok: false, error: `Could not save truth record: ${error.message}` };
    }
  } else {
    const { data, error } = await supabase
      .from("product_truth_records")
      .insert(recordPayload)
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: `Could not create truth record: ${error?.message ?? "unknown error"}`,
      };
    }
    recordId = data.id as string;
  }

  await writeAudit(supabase, {
    orgId: org.id,
    actor: userId,
    entity: "product_truth_record",
    entityId: recordId,
    field: "record",
    oldValue: null,
    newValue: {
      ingredients: input.ingredients,
      allergens: input.allergens,
      serving_size: input.servingSize,
      net_weight: input.netWeight,
      approval_status: input.approvalStatus,
      nutrition_file_path: nutritionFilePath,
      label_artwork_path: labelArtworkPath,
    },
  });

  revalidatePath(`/products/${input.productId}`, "page");
  revalidatePath("/products", "page");
  return { ok: true };
}

// =============================================================================
// upsertClaim
// =============================================================================

export async function upsertClaim(form: FormData): Promise<ActionResult> {
  const { userId, org } = await requireOrg();
  const supabase = createServiceClient();

  const parsed = claimSchema.safeParse({
    productId: str(form, "productId"),
    claimId: str(form, "claimId") || undefined,
    claimText: str(form, "claimText"),
    claimType: str(form, "claimType"),
    evidence: str(form, "evidence"),
    approvalStatus: str(form, "approvalStatus"),
    riskLevel: str(form, "riskLevel"),
    channelsUsed: parseCommaList(str(form, "channelsUsed")),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const input = parsed.data;

  // Defence-in-depth: confirm product ownership.
  const productRes = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", input.productId)
    .maybeSingle();
  if (productRes.error) {
    return { ok: false, error: `Could not load product: ${productRes.error.message}` };
  }
  if (!productRes.data) {
    return { ok: false, error: "Product not found." };
  }

  const claimPayload = {
    organization_id: org.id,
    product_id: input.productId,
    claim_text: input.claimText,
    claim_type: input.claimType,
    evidence: input.evidence,
    approval_status: input.approvalStatus,
    risk_level: input.riskLevel,
    channels_used: input.channelsUsed,
    updated_at: new Date().toISOString(),
  };

  let claimId = input.claimId ?? null;

  if (claimId) {
    const { error } = await supabase
      .from("claims")
      .update(claimPayload)
      .eq("id", claimId)
      .eq("organization_id", org.id);
    if (error) {
      return { ok: false, error: `Could not save claim: ${error.message}` };
    }
  } else {
    const { data, error } = await supabase
      .from("claims")
      .insert(claimPayload)
      .select("id")
      .single();
    if (error || !data) {
      return {
        ok: false,
        error: `Could not create claim: ${error?.message ?? "unknown error"}`,
      };
    }
    claimId = data.id as string;
  }

  await writeAudit(supabase, {
    orgId: org.id,
    actor: userId,
    entity: "claim",
    entityId: claimId,
    field: "claim",
    oldValue: null,
    newValue: {
      claim_text: input.claimText,
      claim_type: input.claimType,
      evidence: input.evidence,
      approval_status: input.approvalStatus,
      risk_level: input.riskLevel,
      channels_used: input.channelsUsed,
    },
  });

  revalidatePath(`/products/${input.productId}`, "page");
  revalidatePath("/products", "page");
  return { ok: true };
}
