"use client";

import { AuthContext } from "@/lib/auth/client";
import DashboardPage from "@/app/dashboard/page";

const mockAuthValue = {
  data: { user: { id: "dev-user", email: "dev@local", name: "Dev" } },
  status: "authenticated" as const,
  user: null,
};

export default function DevDashboardPage() {
  return (
    <AuthContext.Provider value={mockAuthValue}>
      <DashboardPage />
    </AuthContext.Provider>
  );
}
