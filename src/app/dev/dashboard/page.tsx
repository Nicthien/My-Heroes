"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthContext } from "@/lib/auth/client";
import DashboardPage from "@/app/dashboard/page";

const baseUser = { id: "dev-user", email: "dev@local", name: "Dev" };

// useSearchParams() forces a client-side render bail-out; isolate it in a child
// component so the page itself can stream behind a Suspense boundary (Next 16
// prerender requirement).
function DevDashboardInner() {
  const params = useSearchParams();
  const isAdmin = params.get("admin") === "1";

  const mockAuthValue = useMemo(
    () => ({
      data: { user: isAdmin ? { ...baseUser, role: "admin" as const } : baseUser },
      status: "authenticated" as const,
      user: null,
    }),
    [isAdmin],
  );

  return (
    <AuthContext.Provider value={mockAuthValue}>
      <DashboardPage />
    </AuthContext.Provider>
  );
}

export default function DevDashboardPage() {
  return (
    <Suspense fallback={null}>
      <DevDashboardInner />
    </Suspense>
  );
}
