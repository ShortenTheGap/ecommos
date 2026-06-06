"use client";

/**
 * Truth record editor — client form wrapping the `updateTruthRecord` Server
 * Action (Module 2).
 *
 * Renders the record's fields (ingredients/allergens as comma inputs, serving
 * size, net weight, approval status, nutrition + label uploads). Submits the
 * native FormData to the action, captures the typed `ActionResult`, and surfaces
 * pending + error/success state. Disables the submit button while pending.
 *
 * When `record` is null the form offers a "create" flow (no recordId hidden
 * field → the action inserts a new record).
 */

import { useState, useTransition } from "react";

import { Card, Button } from "@/components/bento";
import type { ProductTruthRecord } from "@/lib/types";
import { truthRecordApprovalStatuses } from "@/lib/validation";
import { updateTruthRecord } from "../../actions";

const APPROVAL_LABEL: Record<(typeof truthRecordApprovalStatuses)[number], string> = {
  draft: "Draft",
  pending: "Pending review",
  approved: "Approved",
};

export function TruthRecordForm({
  productId,
  record,
}: {
  productId: string;
  record: ProductTruthRecord | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateTruthRecord(formData);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  const ingredients = (record?.ingredients ?? []).join(", ");
  const allergens = (record?.allergens ?? []).join(", ");
  const status = record?.approval_status ?? "draft";

  return (
    <Card>
      <form action={handleSubmit} className="vault-form">
        <input type="hidden" name="productId" value={productId} />
        {record && <input type="hidden" name="recordId" value={record.id} />}
        {/* Preserve the existing nutrition path when no new file is uploaded. */}
        <input
          type="hidden"
          name="nutritionFilePath"
          value={record?.nutrition_file_path ?? ""}
        />

        <div className="vault-field">
          <label className="vault-label" htmlFor="tr-ingredients">
            Ingredients
          </label>
          <input
            id="tr-ingredients"
            name="ingredients"
            type="text"
            className="vault-input"
            defaultValue={ingredients}
            placeholder="Honey, Chili Pepper, Apple Cider Vinegar"
          />
          <span className="vault-help">Comma-separated, in descending order by weight.</span>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="tr-allergens">
            Allergens
          </label>
          <input
            id="tr-allergens"
            name="allergens"
            type="text"
            className="vault-input"
            defaultValue={allergens}
            placeholder="None, or e.g. Tree Nuts, Soy"
          />
          <span className="vault-help">Comma-separated. Leave blank if none apply.</span>
        </div>

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="tr-serving">
              Serving size
            </label>
            <input
              id="tr-serving"
              name="servingSize"
              type="text"
              className="vault-input"
              defaultValue={record?.serving_size ?? ""}
              placeholder="1 tbsp (21g)"
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="tr-weight">
              Net weight
            </label>
            <input
              id="tr-weight"
              name="netWeight"
              type="text"
              className="vault-input"
              defaultValue={record?.net_weight ?? ""}
              placeholder="8 oz (227g)"
            />
          </div>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="tr-status">
            Approval status
          </label>
          <select
            id="tr-status"
            name="approvalStatus"
            className="vault-input"
            defaultValue={status}
          >
            {truthRecordApprovalStatuses.map((s) => (
              <option key={s} value={s}>
                {APPROVAL_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="tr-nutrition">
              Nutrition panel
            </label>
            <input
              id="tr-nutrition"
              name="nutritionFile"
              type="file"
              className="vault-file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
            />
            {record?.nutrition_file_path && (
              <span className="vault-help vault-help--ok">
                Current file on record. Uploading replaces it.
              </span>
            )}
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="tr-label">
              Label artwork
            </label>
            <input
              id="tr-label"
              name="labelFile"
              type="file"
              className="vault-file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
            />
            <span className="vault-help">Optional. PDF or image, max 10&nbsp;MB.</span>
          </div>
        </div>

        <div className="vault-form-footer">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : record ? "Save truth record" : "Create truth record"}
          </Button>
          {error && (
            <span className="vault-msg vault-msg--error" role="alert">
              {error}
            </span>
          )}
          {saved && !error && (
            <span className="vault-msg vault-msg--ok" role="status">
              Saved.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
