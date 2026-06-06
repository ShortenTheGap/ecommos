/**
 * Shown when a product id does not resolve (wrong id, or not in the caller's
 * org). Reuses the shared EmptyState with a link back to the catalogue.
 */

import Link from "next/link";

import { EmptyState } from "@/components/states";
import { Button } from "@/components/bento";

export default function ProductNotFound() {
  return (
    <section style={{ marginTop: "var(--space-8)" }}>
      <EmptyState
        label="Product not found"
        description="This product does not exist, or it is not part of your organization."
        action={
          <Link href="/products">
            <Button>Back to products</Button>
          </Link>
        }
      />
    </section>
  );
}
