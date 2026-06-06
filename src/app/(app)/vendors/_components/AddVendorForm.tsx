"use client";

/**
 * Add Vendor inline form — client component wrapping the `createVendor` Server
 * Action. Collapsible: shows a button until the user expands it. Uses
 * useTransition for pending/disabled/error state.
 */

import { useState, useTransition } from "react";

import { Card, Button } from "@/components/bento";
import { createVendor } from "../actions";
import type { ActionResult } from "../actions";

const VENDOR_TYPES = [
  { value: "", label: "Select type…" },
  { value: "co_packer", label: "Co-packer" },
  { value: "supplier", label: "Supplier" },
  { value: "packaging", label: "Packaging" },
  { value: "3pl", label: "3PL" },
  { value: "agency", label: "Agency" },
] as const;

export function AddVendorForm() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result: ActionResult = await createVendor(formData);
      if (result.ok) {
        setSaved(true);
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  if (!open) {
    return (
      <div className="vendor-add-bar">
        {saved && (
          <span className="vault-msg vault-msg--ok" role="status">
            Vendor added.
          </span>
        )}
        <Button variant="ghost" type="button" onClick={() => setOpen(true)}>
          + Add vendor
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <form action={handleSubmit} className="vault-form">
        <div className="vault-field-row">
          <div className="vault-field">
            <label className="vault-label" htmlFor="av-name">
              Vendor name <span aria-hidden="true">*</span>
            </label>
            <input
              id="av-name"
              name="name"
              type="text"
              className="vault-input"
              placeholder="e.g. Cascade Co-Pack"
              required
              autoFocus
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="av-type">
              Type
            </label>
            <select id="av-type" name="vendorType" className="vault-input">
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
            <label className="vault-label" htmlFor="av-moq">
              MOQ (units)
            </label>
            <input
              id="av-moq"
              name="moq"
              type="number"
              min="1"
              step="1"
              className="vault-input"
              placeholder="e.g. 1000"
            />
          </div>
          <div className="vault-field">
            <label className="vault-label" htmlFor="av-lead">
              Lead time (days)
            </label>
            <input
              id="av-lead"
              name="leadTimeDays"
              type="number"
              min="1"
              step="1"
              className="vault-input"
              placeholder="e.g. 30"
            />
          </div>
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="av-certs">
            Certifications
          </label>
          <input
            id="av-certs"
            name="certifications"
            type="text"
            className="vault-input"
            placeholder="SQF, Organic, Kosher (comma-separated)"
          />
        </div>

        <div className="vault-field">
          <label className="vault-label" htmlFor="av-contacts">
            Contact info
          </label>
          <input
            id="av-contacts"
            name="contacts"
            type="text"
            className="vault-input"
            placeholder='{"name": "Jane Smith", "email": "jane@vendor.com"} or free text'
          />
          <span className="vault-help">
            JSON object or free text — stored as a note.
          </span>
        </div>

        <div className="vault-form-footer">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add vendor"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          {error && (
            <span className="vault-msg vault-msg--error" role="alert">
              {error}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
