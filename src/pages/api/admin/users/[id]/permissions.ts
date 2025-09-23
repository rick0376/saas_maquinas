// pages/api/admin/users/[id]/permissoes.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import type { NextAuthOptions, Session } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

type Role = "USER" | "ADMIN" | "SUPERADMIN";
type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: Role;
  tenantId?: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "PUT") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const session = (await getServerSession(
    req,
    res,
    authOptions as NextAuthOptions
  )) as Session | null;

  if (!session?.user) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const sUser = session.user as SessionUser;
  const role: Role = (sUser.role as Role) || "USER";
  const sessionTenantId = (sUser.tenantId as string | null) ?? null;

  const { id } = req.query as { id: string };
  const { permissoes } = (req.body || {}) as { permissoes: any };

  if (!permissoes || typeof permissoes !== "object") {
    return res.status(400).json({ ok: false, message: "permissoes inválido" });
  }

  try {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!target) {
      return res
        .status(404)
        .json({ ok: false, message: "Usuário não encontrado." });
    }

    // ✅ Regras finais:
    // SUPERADMIN: pode alterar qualquer usuário (independente de tenant)
    // ADMIN/USER: só se for do MESMO tenant
    if (role !== "SUPERADMIN") {
      const sameTenant =
        target.tenantId != null &&
        sessionTenantId != null &&
        target.tenantId === sessionTenantId;

      if (!sameTenant) {
        return res.status(403).json({ ok: false, message: "Sem permissão." });
      }
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { permissoes },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("[/api/admin/users/[id]/permissoes] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
