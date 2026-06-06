/**
 * Product-page sync checklist — purely derived & presentational (Module 2).
 *
 * Computes a fixed set of compliance/launch-readiness checks from the product's
 * truth record + claims and renders each as a check (✓) or cross (✗) row.
 * Server-safe (no client hooks).
 */

import { Card } from "@/components/bento";
import type { Claim, ProductTruthRecord } from "@/lib/types";

interface ChecklistItem {
  label: string;
  done: boolean;
  hint: string;
}

function buildChecklist(
  truthRecord: ProductTruthRecord | null,
  claims: Claim[],
): ChecklistItem[] {
  const ingredients = truthRecord?.ingredients ?? [];
  const allergens = truthRecord?.allergens ?? [];
  const hasApprovedClaim = claims.some(
    (c) => c.approval_status === "approved" && !!c.evidence,
  );

  return [
    {
      label: "Ingredients present",
      done: ingredients.length > 0,
      hint: "List the full ingredient panel on the truth record.",
    },
    {
      label: "Allergens declared",
      done: allergens.length > 0,
      hint: "Declare allergens (or note that none apply).",
    },
    {
      label: "Truth record approved",
      done: truthRecord?.approval_status === "approved",
      hint: "Set the record's approval status to Approved once reviewed.",
    },
    {
      label: "At least one approved claim with evidence",
      done: hasApprovedClaim,
      hint: "Approve a claim and attach evidence so the AI can cite it.",
    },
    {
      label: "Nutrition file uploaded",
      done: !!truthRecord?.nutrition_file_path,
      hint: "Upload the nutrition panel artwork on the truth record.",
    },
  ];
}

export function SyncChecklist({
  truthRecord,
  claims,
}: {
  truthRecord: ProductTruthRecord | null;
  claims: Claim[];
}) {
  const items = buildChecklist(truthRecord, claims);
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  return (
    <Card variant={allDone ? "accent" : "default"}>
      <div className="checklist-head">
        <span className="checklist-progress">
          {doneCount} / {items.length} complete
        </span>
        {allDone && <span className="checklist-ready">Ready to publish</span>}
      </div>
      <ul className="checklist">
        {items.map((item) => (
          <li key={item.label} className="checklist-row">
            <span
              className={`checklist-mark ${
                item.done ? "checklist-mark--done" : "checklist-mark--todo"
              }`}
              aria-hidden="true"
            >
              {item.done ? "✓" : "✗"}
            </span>
            <span className="checklist-body">
              <span className="checklist-label">{item.label}</span>
              {!item.done && <span className="checklist-hint">{item.hint}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
