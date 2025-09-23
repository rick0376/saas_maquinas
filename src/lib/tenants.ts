// src/lib/tenant.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export type Role = "USER" | "ADMIN" | "SUPERADMIN";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * Para rotas GET (listagens/consultas):
 * - SUPERADMIN:
 *    usa cookie `selectedTenantId` (se existir)
 *    senão usa ?tenantId=... (query)
 *    senão usa tenantId da sessão
 *    senão null => agregado (todos)
 * - USER/ADMIN: sempre o tenantId da sessão.
 */
export async function resolveTenantFromRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ role: Role | null; tenantId: string | null }> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return { role: null, tenantId: null };

  const role = (session.user as any).role as Role;
  const sessionTenantId = (session.user as any).tenantId as string | undefined;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (role === "SUPERADMIN") {
    const effective = cookieTenant || queryTenant || sessionTenantId || null;
    return { role, tenantId: effective };
  }
  return { role, tenantId: sessionTenantId ?? null };
}

/**
 * Para rotas de escrita (POST/PUT/DELETE):
 * - USER/ADMIN: obriga usar SEMPRE o tenantId da sessão.
 * - SUPERADMIN: exige um tenantId específico (NÃO permite agregado);
 *   tenta cookie -> query -> body. Se não tiver, retorna 400.
 */
export async function requireTenantForWrite(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ role: Role; tenantId: string } | null> {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return null;
  }

  const role = (session.user as any).role as Role;
  const sessionTenantId = (session.user as any).tenantId as string | undefined;

  if (role !== "SUPERADMIN") {
    if (!sessionTenantId) {
      res.status(400).json({ ok: false, message: "Tenant inválido." });
      return null;
    }
    return { role, tenantId: sessionTenantId };
  }

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
  const bodyTenant =
    req.body && typeof req.body.tenantId === "string"
      ? (req.body.tenantId as string)
      : undefined;

  const t = cookieTenant || queryTenant || bodyTenant || null;
  if (!t) {
    res
      .status(400)
      .json({ ok: false, message: "Selecione um cliente antes de gravar." });
    return null;
  }
  return { role, tenantId: t };
}
