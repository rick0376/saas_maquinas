// src/pages/api/tenant/current.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function resolveTenantId(req: NextApiRequest, session: any): string | null {
  const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
  const isSuper = role === "SUPERADMIN";
  const sessionTenantId = (session.user as any)?.tenantId as string | undefined;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (isSuper) {
    // SUPERADMIN: pode estar agregando todos (null) ou um tenant escolhido
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  // USER/ADMIN: sempre o tenant da sessão
  return (sessionTenantId ?? null) as string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user)
    return res.status(401).json({ ok: false, message: "Unauthorized" });

  const tenantId = resolveTenantId(req, session);
  try {
    if (!tenantId) {
      // agregado (todos)
      return res.json({ ok: true, data: null });
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    return res.json({ ok: true, data: tenant }); // pode ser null se id inválido
  } catch (e) {
    console.error("[/api/tenant/current] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
