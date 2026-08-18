import Link from "next/link";

import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      title="There's nothing at this address"
      body="The page may have moved, or the dataset, run, or customer it pointed at may have been deleted."
    >
      <Button size="sm" render={<Link href="/">Back to the overview</Link>} />
    </EmptyState>
  );
}
