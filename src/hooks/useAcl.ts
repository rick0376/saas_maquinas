// src/hooks/useAcl.ts
import { useSession } from "next-auth/react";
import {
  ensurePermissions,
  type PermissionModule,
  type PermissionAction,
} from "../utils/permissions";
import { useMemo } from "react";

type PermissionsMap = Record<PermissionModule, PermissionAction[]>;

export function useAcl() {
  const { data } = useSession();
  const raw = (data?.user as any)?.permissoes;

  const permissoes: PermissionsMap = useMemo(
    () => ensurePermissions(raw) as unknown as PermissionsMap,
    [raw]
  );

  // 👉 Função can feita aqui
  function can(mod: PermissionModule, act: PermissionAction) {
    return permissoes[mod]?.includes(act) ?? false;
  }

  return { permissoes, can };
}

export type { PermissionModule, PermissionAction };
