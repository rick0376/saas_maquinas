import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query as { id: string };

  try {
    const user = await requireUser(req, res); // { role, ... }
    const isSuper = user.role === "SUPERADMIN";

    if (req.method === "PUT") {
      const { name } = req.body ?? {};
      if (!name) return res.status(400).json({ error: "name obrigatório" });

      // permitir renomear: SUPERADMIN sempre; os demais só se for o tenant atual
      if (!isSuper && user.tenantId !== id) {
        return res.status(403).json({ error: "Sem permissão" });
      }

      const t = await prisma.tenant.update({ where: { id }, data: { name } });
      return res.json({ data: t });
    }

    if (req.method === "DELETE") {
      if (!isSuper) return res.status(403).json({ error: "Apenas SUPERADMIN" });

      // atenção: deletar tenant com FK exige cascade (você tem onDelete: Cascade).
      await prisma.tenant.delete({ where: { id } });
      return res.status(204).end();
    }

    return res.status(405).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro na API de clientes" });
  }
}
