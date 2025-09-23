// src/pages/api/admin/tenants.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const role = (session?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;

  if (!session?.user || role !== "SUPERADMIN") {
    // se preferir 401, pode manter; 403 é mais semântico aqui
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }

  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, logoBase64: true },
      orderBy: { name: "asc" },
    });

    return res.json({ ok: true, data: tenants });
  } catch (e: any) {
    console.error("[/api/admin/tenants] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
