// src/hooks/usePermissions.ts
import { useSession } from "next-auth/react";
import { useMemo } from "react";

export function usePermissions() {
  const { data } = useSession();
  const role = (data?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;

  const isSuperAdmin = role === "SUPERADMIN";
  const isClientAdmin = role === "ADMIN";

  return { role, isSuperAdmin, isClientAdmin };
}
