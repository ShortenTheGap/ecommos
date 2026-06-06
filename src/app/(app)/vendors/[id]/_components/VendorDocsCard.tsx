"use client";

/**
 * Vendor Documents card — lists uploaded docs (certifications, contracts) from
 * the `files` bucket under `${orgId}/vendors/${vendorId}/...` and provides an
 * upload form wired to the `uploadVendorDoc` Server Action.
 *
 * Doc list: passed in from the server page (signed URLs from a bucket list).
 * Upload: client form using useTransition for pending/error state.
 */

import { useState, useTransition } from "react";

import { Card, Eyebrow, Button } from "@/components/bento";
import { uploadVendorDoc } from "../../actions";

export interface VendorDoc {
  name: string;
  path: string;
  signedUrl: string;
}

export function VendorDocsCard({
  vendorId,
  initialDocs,
}: {
  vendorId: string;
  initialDocs: VendorDoc[];
}) {
  const [docs, setDocs] = useState<VendorDoc[]>(initialDocs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleUpload(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await uploadVendorDoc(formData);
      if (result.ok) {
        // Optimistically append the newly uploaded file name.
        const file = formData.get("file");
        if (file instanceof File) {
          setDocs((prev) => [
            ...prev,
            {
              name: file.name,
              path: result.path,
              // We don't have a fresh signed URL client-side; show path as
              // label and note it will appear on the next page load with a
              // real URL.
              signedUrl: "#",
            },
          ]);
        }
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <Card>
      <Eyebrow>Documents</Eyebrow>

      {docs.length === 0 ? (
        <p className="vault-empty-note" style={{ marginTop: "var(--space-4)" }}>
          No documents uploaded yet.
        </p>
      ) : (
        <ul className="vendor-docs-list" style={{ marginTop: "var(--space-4)" }}>
          {docs.map((doc) => (
            <li key={doc.path} className="vendor-docs-item">
              <span className="vendor-docs-icon" aria-hidden="true">
                ↗
              </span>
              {doc.signedUrl !== "#" ? (
                <a
                  href={doc.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vendor-docs-link"
                >
                  {doc.name}
                </a>
              ) : (
                <span className="vendor-docs-name">{doc.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        action={handleUpload}
        className="vault-form"
        style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--border)" }}
      >
        <input type="hidden" name="vendorId" value={vendorId} />

        <div className="vault-field">
          <label className="vault-label" htmlFor="vd-file">
            Upload document
          </label>
          <input
            id="vd-file"
            name="file"
            type="file"
            className="vault-file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            required
          />
          <span className="vault-help">
            PDF, PNG, JPEG, or WebP — max 10&nbsp;MB. Use for certifications
            and contracts.
          </span>
        </div>

        <div className="vault-form-footer">
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload document"}
          </Button>
          {error && (
            <span className="vault-msg vault-msg--error" role="alert">
              {error}
            </span>
          )}
          {saved && !error && (
            <span className="vault-msg vault-msg--ok" role="status">
              Uploaded.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
