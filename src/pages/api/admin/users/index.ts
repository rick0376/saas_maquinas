// pages/api/admin/users/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const m = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return m ? decodeURIComponent(m.split("=")[1]) : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const sUser = session?.user as any;
  if (!sUser) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const role: "USER" | "ADMIN" | "SUPERADMIN" = sUser.role || "USER";
  const isSuper = role === "SUPERADMIN";

  const adminMode = readCookie(req, "adminMode") === "1";
  let selectedTenantId = readCookie(req, "selectedTenantId") || null;
  // Trata "ALL" (ou vazio) como agregado
  if (selectedTenantId === "ALL" || selectedTenantId === "") {
    selectedTenantId = null;
  }

  // Monta o filtro:
  // - USER/ADMIN: sempre próprio tenant
  // - SUPERADMIN + adminMode + selectedTenantId -> filtra por esse tenant
  // - SUPERADMIN agregado -> sem filtro (todos)
  let where: any = {};
  if (!isSuper) {
    where.tenantId = sUser.tenantId;
  } else if (adminMode && selectedTenantId) {
    where.tenantId = selectedTenantId;
  }

  try {
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        permissoes: true,
        tenant: { select: { name: true } },
      },
      orderBy: [{ tenantId: "asc" }, { name: "asc" }, { email: "asc" }],
    });

    res.setHeader("Cache-Control", "no-store");

    return res.json({
      ok: true,
      data: users,
      meta: {
        role,
        adminMode,
        selectedTenantId,
        currentTenantId: sUser.tenantId || null,
      },
    });
  } catch (e) {
    console.error("[/api/admin/users] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
