"use client";

import { Suspense } from "react";
import ConfirmEmailView from "@/components/auth/ConfirmEmailView";

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailView />
    </Suspense>
  );
}
