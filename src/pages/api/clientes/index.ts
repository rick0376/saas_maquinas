import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const user = await requireUser(req, res); // { id, role, tenantId }

    if (req.method === "GET") {
      const tenants = await prisma.tenant.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, createdAt: true },
      });
      return res.json({
        data: tenants,
        currentTenantId: user.tenantId,
        role: user.role,
      });
    }

    if (req.method === "POST") {
      const { name } = req.body ?? {};
      if (!name || typeof name !== "string")
        return res.status(400).json({ error: "name é obrigatório" });

      const tenant = await prisma.tenant.create({ data: { name } });

      // mover usuário atual para o novo tenant
      await prisma.user.update({
        where: { id: user.id },
        data: { tenantId: tenant.id },
      });

      return res.status(201).json({ data: tenant });
    }

    return res.status(405).end();
  } catch (e: any) {
    if (e.message === "NO_USER")
      return res.status(401).json({ error: "Não autenticado" });
    console.error(e);
    return res.status(500).json({ error: "Erro na API de clientes" });
  }
}
