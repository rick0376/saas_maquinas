// src/hooks/useAcl.ts
import { useSession } from "next-auth/react";
import {
  ensurePermissions,
  type PermissionsMap,
  can as canHelper,
  type PermissionModule,
  type PermissionAction,
} from "../utils/permissions"; // 👈 relativo (sem "@")
import { useMemo } from "react";

export function useAcl() {
  const { data } = useSession();
  const raw = (data?.user as any)?.permissoes;
  const permissoes: PermissionsMap = useMemo(
    () => ensurePermissions(raw),
    [raw]
  );

  function can(mod: PermissionModule, act: PermissionAction) {
    return canHelper(permissoes, mod, act);
  }

  return { permissoes, can };
}

export type { PermissionModule, PermissionAction };
