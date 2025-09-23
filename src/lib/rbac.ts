import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "./authGuard";

const RolePerms: Record<string, string[]> = {
  USER: ["paradas:start", "relatorios:export"],
  ADMIN: [
    "paradas:start",
    "paradas:finalize",
    "maquinas:create",
    "maquinas:update",
    "secoes:create",
    "secoes:update",
    "contatos:create",
    "contatos:update",
    "relatorios:export",
    "integracoes:whatsapp:send",
  ],
  SUPERADMIN: ["*"],
};

export function hasPermission(role: string, perm: string) {
  if (!role) return false;
  if (RolePerms[role]?.includes("*")) return true;
  return RolePerms[role]?.includes(perm) ?? false;
}

export async function requirePerm(
  req: NextApiRequest,
  res: NextApiResponse,
  perm: string
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return null;
  const { role } = ctx as any;
  if (!hasPermission(role, perm)) {
    res
      .status(403)
      .json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Permissão negada" },
      });
    return null;
  }
  return ctx;
}
