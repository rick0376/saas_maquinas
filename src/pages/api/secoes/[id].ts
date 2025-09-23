import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query as { id: string };

  try {
    const tenantId = await requireTenantId(req, res);

    if (req.method === "PUT") {
      const { nome, descricao, paiId } = req.body ?? {};
      if (!nome || typeof nome !== "string")
        return res.status(400).json({ error: "nome é obrigatório" });

      const secao = await prisma.secao.update({
        where: { id },
        data: {
          nome,
          descricao: descricao || null,
          paiId: paiId || null,
          tenantId,
        },
      });
      return res.json({ data: secao });
    }

    if (req.method === "DELETE") {
      await prisma.secao.delete({ where: { id } });
      return res.status(204).end();
    }

    return res.status(405).end();
  } catch (e: any) {
    if (e.message === "NO_TENANT")
      return res.status(401).json({ error: "Não autenticado" });
    console.error(e);
    return res.status(500).json({ error: "Erro na API de seções" });
  }
}
