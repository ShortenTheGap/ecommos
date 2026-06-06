"use server";

/**
 * Server Actions for the Vendor Workspace (Module 6).
 *
 *   createVendor      — insert a new vendor row (name, type, MOQ, lead time,
 *                       certifications, capabilities, contacts, terms).
 *   updateVendor      — update an existing vendor's profile fields.
 *   createProductionRun — add a production run linked to a vendor + product.
 *   uploadVendorDoc   — upload a certification or contract to the `files` bucket
 *                       under `${orgId}/vendors/${vendorId}/...`.
 *
 * All actions:
 *   - Use the cookie-aware Supabase client so RLS is enforced as the signed-in
 *     user.
 *   - Validate input with Zod; return `{ ok: false, error }` on validation or
 *     write failures — they never throw for expected errors.
 *   - Call `revalidatePath` so affected pages re-fetch fresh data.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireOrg } from "@/lib/data/org";
import { createClient } from "@/lib/supabase/server";
import type { VendorType } from "@/lib/types";

// =============================================================================
// Result type
// =============================================================================

export type ActionResult = { ok: true } | { ok: false; error: string };

const STORAGE_BUCKET = "files";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_DOC_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const VENDOR_TYPES = [
  "co_packer",
  "supplier",
  "packaging",
  "3pl",
  "agency",
] as const satisfies readonly VendorType[];

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

/** Coerce a numeric string to a positive integer, or null. */
function positiveInt(raw: string): number | null {
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Split a comma-separated string, trim, drop empties. */
function commaList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// =============================================================================
// Zod schemas
// =============================================================================

const optText = z
  .string()
  .transform((v) => {
    const t = v.trim();
    return t.length === 0 ? null : t;
  })
  .nullable()
  .default(null);

const vendorSchema = z.object({
  name: z.string().trim().min(1, "Vendor name is required."),
  vendorType: z.enum(VENDOR_TYPES).nullable().default(null),
  moq: z.number().int().positive().nullable().default(null),
  leadTimeDays: z.number().int().positive().nullable().default(null),
  certifications: z.array(z.string().min(1)).default([]),
  capabilities: z.array(z.string().min(1)).default([]),
  terms: optText,
  /** contacts stored as JSON string from a textarea; parsed below. */
  contactsRaw: optText,
});

const productionRunSchema = z.object({
  vendorId: z.string().uuid("Expected a valid vendor id."),
  productId: z.string().uuid("Expected a valid product id.").nullable().default(null),
  batch: optText,
  lot: optText,
  quantity: z.number().int().positive().nullable().default(null),
  cost: z.number().positive().nullable().default(null),
  productionDate: optText,
  expiryDate: optText,
});

// =============================================================================
// createVendor
// =============================================================================

/**
 * Insert a new vendor row for the caller's org.
 * Returns `{ ok: true }` on success; `{ ok: false, error }` on failure.
 */
export async function createVendor(form: FormData): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const parsed = vendorSchema.safeParse({
    name: str(form, "name"),
    vendorType: (str(form, "vendorType") || null) as VendorType | null,
    moq: positiveInt(str(form, "moq")) ?? null,
    leadTimeDays: positiveInt(str(form, "leadTimeDays")) ?? null,
    certifications: commaList(str(form, "certifications")),
    capabilities: commaList(str(form, "capabilities")),
    terms: str(form, "terms"),
    contactsRaw: str(form, "contacts"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;
  let contacts: Record<string, unknown> | null = null;
  if (input.contactsRaw) {
    try {
      contacts = JSON.parse(input.contactsRaw) as Record<string, unknown>;
    } catch {
      // Non-JSON contacts — store as a plain text note keyed by "note".
      contacts = { note: input.contactsRaw };
    }
  }

  const { error } = await supabase.from("vendors").insert({
    organization_id: org.id,
    name: input.name,
    vendor_type: input.vendorType,
    moq: input.moq,
    lead_time_days: input.leadTimeDays,
    certifications: input.certifications,
    capabilities: input.capabilities,
    terms: input.terms,
    contacts,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { ok: false, error: `Could not create vendor: ${error.message}` };
  }

  revalidatePath("/vendors", "page");
  return { ok: true };
}

// =============================================================================
// updateVendor
// =============================================================================

/**
 * Update an existing vendor's profile fields.
 * The caller must supply a `vendorId` hidden field in the FormData.
 */
export async function updateVendor(form: FormData): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const vendorId = str(form, "vendorId");
  if (!vendorId) {
    return { ok: false, error: "Vendor id is required." };
  }

  const parsed = vendorSchema.safeParse({
    name: str(form, "name"),
    vendorType: (str(form, "vendorType") || null) as VendorType | null,
    moq: positiveInt(str(form, "moq")) ?? null,
    leadTimeDays: positiveInt(str(form, "leadTimeDays")) ?? null,
    certifications: commaList(str(form, "certifications")),
    capabilities: commaList(str(form, "capabilities")),
    terms: str(form, "terms"),
    contactsRaw: str(form, "contacts"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;
  let contacts: Record<string, unknown> | null = null;
  if (input.contactsRaw) {
    try {
      contacts = JSON.parse(input.contactsRaw) as Record<string, unknown>;
    } catch {
      contacts = { note: input.contactsRaw };
    }
  }

  const { error } = await supabase
    .from("vendors")
    .update({
      name: input.name,
      vendor_type: input.vendorType,
      moq: input.moq,
      lead_time_days: input.leadTimeDays,
      certifications: input.certifications,
      capabilities: input.capabilities,
      terms: input.terms,
      contacts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", vendorId)
    .eq("organization_id", org.id);

  if (error) {
    return { ok: false, error: `Could not update vendor: ${error.message}` };
  }

  revalidatePath(`/vendors/${vendorId}`, "page");
  revalidatePath("/vendors", "page");
  return { ok: true };
}

// =============================================================================
// createProductionRun
// =============================================================================

/**
 * Insert a new production run linked to a vendor (and optionally a product).
 */
export async function createProductionRun(form: FormData): Promise<ActionResult> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const rawProductId = str(form, "productId");
  const rawQty = str(form, "quantity");
  const rawCost = str(form, "cost");

  const parsed = productionRunSchema.safeParse({
    vendorId: str(form, "vendorId"),
    productId: rawProductId || null,
    batch: str(form, "batch"),
    lot: str(form, "lot"),
    quantity: rawQty ? parseInt(rawQty, 10) || null : null,
    cost: rawCost ? parseFloat(rawCost) || null : null,
    productionDate: str(form, "productionDate"),
    expiryDate: str(form, "expiryDate"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const input = parsed.data;

  // Confirm the vendor belongs to the caller's org.
  const vendorRes = await supabase
    .from("vendors")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", input.vendorId)
    .maybeSingle();

  if (vendorRes.error) {
    return { ok: false, error: `Could not verify vendor: ${vendorRes.error.message}` };
  }
  if (!vendorRes.data) {
    return { ok: false, error: "Vendor not found." };
  }

  const { error } = await supabase.from("production_runs").insert({
    organization_id: org.id,
    vendor_id: input.vendorId,
    product_id: input.productId,
    batch: input.batch,
    lot: input.lot,
    quantity: input.quantity,
    cost: input.cost,
    production_date: input.productionDate,
    expiry_date: input.expiryDate,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return { ok: false, error: `Could not create production run: ${error.message}` };
  }

  revalidatePath(`/vendors/${input.vendorId}`, "page");
  revalidatePath("/vendors", "page");
  return { ok: true };
}

// =============================================================================
// uploadVendorDoc
// =============================================================================

/**
 * Upload a vendor document (certification, contract, etc.) to the `files`
 * bucket under `${orgId}/vendors/${vendorId}/...`.
 *
 * Returns `{ ok: true, path }` on success so the client can display it.
 * The path is NOT persisted to a DB column (no dedicated column exists on the
 * vendor row); callers should list bucket objects to enumerate uploaded docs
 * for a given vendor prefix.
 */
export async function uploadVendorDoc(
  form: FormData,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { org } = await requireOrg();
  const supabase = await createClient();

  const vendorId = str(form, "vendorId");
  if (!vendorId) {
    return { ok: false, error: "Vendor id is required." };
  }

  const file = form.get("file");
  if (!isUploadedFile(file)) {
    return { ok: false, error: "No file provided." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File exceeds the 10 MB limit." };
  }

  if (file.type && !ALLOWED_DOC_TYPES.has(file.type)) {
    return {
      ok: false,
      error: "File type not allowed. Use PDF, PNG, JPEG, or WebP.",
    };
  }

  // Confirm vendor belongs to org (defence-in-depth on top of RLS).
  const vendorRes = await supabase
    .from("vendors")
    .select("id")
    .eq("organization_id", org.id)
    .eq("id", vendorId)
    .maybeSingle();

  if (vendorRes.error || !vendorRes.data) {
    return { ok: false, error: "Vendor not found." };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `${org.id}/vendors/${vendorId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });

  if (error) {
    return { ok: false, error: `Upload failed: ${error.message}` };
  }

  revalidatePath(`/vendors/${vendorId}`, "page");
  return { ok: true, path };
}
