// src/pages/api/painel/maquinas.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function resolveTenant(req: NextApiRequest, session: any) {
  const role = (session?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;
  const isSuper = role === "SUPERADMIN";
  const sessionTenantId = (session?.user as any)?.tenantId as
    | string
    | undefined;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (isSuper) {
    // prioridade: cookie -> query -> tenant da sessão -> null (agregado)
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  // USER/ADMIN sempre no tenant da sessão
  return (sessionTenantId ?? null) as string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, message: "Method not allowed" });

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const tenantId = resolveTenant(req, session);
    const whereBase = tenantId ? { tenantId } : {}; // SUPERADMIN sem seleção => agrega todos

    const maquinas = await prisma.maquina.findMany({
      where: whereBase,
      include: {
        secao: { select: { id: true, nome: true } },
      },
      orderBy: [{ secao: { nome: "asc" } }, { nome: "asc" }],
    });

    return res.json({ ok: true, data: maquinas });
  } catch (e: any) {
    console.error("[/api/painel/maquinas] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
