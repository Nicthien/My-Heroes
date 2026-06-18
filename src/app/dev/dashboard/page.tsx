"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthContext } from "@/lib/auth/client";
import DashboardPage from "@/app/dashboard/page";

const baseUser = { id: "dev-user", email: "dev@local", name: "Dev" };

export default function DevDashboardPage() {
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
