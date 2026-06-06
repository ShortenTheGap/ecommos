"use client";

/**
 * Vendor profile editor — client form wrapping the `updateVendor` Server
 * Action. Renders name, type, MOQ, lead time, certifications, capabilities,
 * contacts (as JSON/text), and terms. Uses useTransition for pending/error.
 */

import { useState, useTransition } from "react";

import { Card, Eyebrow, Button } from "@/components/bento";
import type { Vendor } from "@/lib/types";
import { updateVendor } from "../../actions";

const VENDOR_TYPES = [
  { value: "", label: "Select type…" },
  { value: "co_packer", label: "Co-packer" },
  { value: "supplier", label: "Supplier" },
  { value: "packaging", label: "Packaging" },
  { value: "3pl", label: "3PL" },
  { value: "agency", label: "Agency" },
] as const;

export function VendorProfileForm({ vendor }: { vendor: Vendor }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateVendor(formData);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  const contactsStr = vendor.contacts
    ? JSON.stringify(vendor.contacts, null, 2)
    : "";

  return (
    <Card>
      <Eyebrow>Profile</Eyebrow>
      <form action={handleSubmit} className="vault-form" style={{ marginTop: "var(--space-5)" }}>
        <input type="hidden" name="vendorId" value={vendor.id} />

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="vp-name">
              Vendor name <span aria-hidden="true">*</span>
            </label>
            <input
              id="vp-name"
              name="name"
              type="text"
              className="vault-input"
              defaultValue={vendor.name ?? ""}
              required
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="vp-type">
              Type
            </label>
            <select
              id="vp-type"
              name="vendorType"
              className="vault-input"
              defaultValue={vendor.vendor_type ?? ""}
            >
              {VENDOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="vp-moq">
              MOQ (units)
            </label>
            <input
              id="vp-moq"
              name="moq"
              type="number"
              min="1"
              step="1"
              className="vault-input"
              defaultValue={vendor.moq ?? ""}
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="vp-lead">
              Lead time (days)
            </label>
            <input
              id="vp-lead"
              name="leadTimeDays"
              type="number"
              min="1"
              step="1"
              className="vault-input"
              defaultValue={vendor.lead_time_days ?? ""}
            />
          </div>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="vp-certs">
            Certifications
          </label>
          <input
            id="vp-certs"
            name="certifications"
            type="text"
            className="vault-input"
            defaultValue={(vendor.certifications ?? []).join(", ")}
            placeholder="SQF, Organic, Kosher (comma-separated)"
          />
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="vp-caps">
            Capabilities
          </label>
          <input
            id="vp-caps"
            name="capabilities"
            type="text"
            className="vault-input"
            defaultValue={(vendor.capabilities ?? []).join(", ")}
            placeholder="Hot-fill, Retort, Cold-fill (comma-separated)"
          />
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="vp-contacts">
            Contact info
          </label>
          <textarea
            id="vp-contacts"
            name="contacts"
            className="vault-input vault-textarea"
            rows={3}
            defaultValue={contactsStr}
            placeholder='{"name": "Jane Smith", "email": "jane@vendor.com", "phone": "+1 555 123 4567"}'
          />
          <span className="vault-help">JSON object or free text.</span>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="vp-terms">
            Payment terms
          </label>
          <input
            id="vp-terms"
            name="terms"
            type="text"
            className="vault-input"
            defaultValue={vendor.terms ?? ""}
            placeholder="Net 30, 50% deposit, etc."
          />
        </div>

        <div className="vault-form-footer">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
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
