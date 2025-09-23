// src/lib/auth.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export type Role = "USER" | "ADMIN" | "SUPERADMIN";

type SafeUser = {
  id: string;
  email: string;
  name?: string | null;
  role: Role;
  tenantId: string | null; // pode ser null em SUPERADMIN
};

/* ------------------------------ utils ------------------------------ */
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * Resolve o tenantId efetivo para a requisição:
 * SUPERADMIN: x-tenant-id -> cookie(selectedTenantId) -> query.tenantId -> user.tenantId
 * USER/ADMIN: sempre user.tenantId
 */
function resolveTenantId(
  req: NextApiRequest,
  user: SafeUser | null
): string | null {
  const role = (user?.role ?? "USER") as Role;
  const sessionTenant = user?.tenantId ?? null;

  if (role === "SUPERADMIN") {
    const headerTenant =
      typeof req.headers["x-tenant-id"] === "string"
        ? (req.headers["x-tenant-id"] as string)
        : undefined;
    const cookieTenant = readCookie(req, "selectedTenantId") ?? undefined;
    const queryTenant =
      typeof req.query.tenantId === "string"
        ? (req.query.tenantId as string)
        : undefined;

    return (headerTenant ||
      cookieTenant ||
      queryTenant ||
      sessionTenant ||
      null) as string | null;
  }

  // USER/ADMIN
  return sessionTenant;
}

/* --------------------------- sessão/usuário --------------------------- */
export async function getCurrentUser(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<SafeUser | null> {
  // 1) Session
  const session = await getServerSession(req, res, authOptions);
  const sUser = session?.user as any;

  async function byId(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }
  async function byEmail(email: string) {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });
  }

  if (sUser?.id) {
    const u = await byId(String(sUser.id));
    if (u) return u as SafeUser;
  }
  if (sUser?.email) {
    const u = await byEmail(String(sUser.email));
    if (u) return u as SafeUser;
  }

  // 2) JWT
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const tSub = token?.sub as string | undefined;
  const tEmail = (token?.email as string | undefined)?.toLowerCase();

  if (tSub) {
    const u = await byId(tSub);
    if (u) return u as SafeUser;
  }
  if (tEmail) {
    const u = await byEmail(tEmail);
    if (u) return u as SafeUser;
  }

  return null;
}

/* --------------------------- guards helpers --------------------------- */
export async function requireUser(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<SafeUser> {
  const u = await getCurrentUser(req, res);
  if (!u) throw new Error("NO_USER");
  return u;
}

/**
 * Retorna o tenantId efetivo da requisição.
 * - Para SUPERADMIN, usa x-tenant-id / cookie(selectedTenantId) / query / fallback do usuário.
 * - Para USER/ADMIN, usa o tenant do usuário.
 * Lança "NO_TENANT" se nada for resolvido (para rotas que exigem tenant).
 */
export async function requireTenantId(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string> {
  const user = await getCurrentUser(req, res);
  const tenantId = resolveTenantId(req, user);
  if (tenantId) return tenantId;
  throw new Error("NO_TENANT");
}

/**
 * Útil se você quiser pegar os dois de uma vez.
 */
export async function requireUserAndTenant(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ user: SafeUser; tenantId: string }> {
  const user = await requireUser(req, res);
  const tenantId = resolveTenantId(req, user);
  if (tenantId) return { user, tenantId };
  throw new Error("NO_TENANT");
}
