import { Suspense } from "react";

import { Desk } from "@/components/desk";
import { DeskFallback } from "@/components/desk-frame";

export default function Page() {
  return (
    <Suspense fallback={<DeskFallback />}>
      <Desk />
    </Suspense>
  );
}
