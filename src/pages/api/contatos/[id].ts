// src/pages/api/contatos/[id].ts
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
      const { nome, celular } = req.body ?? {};
      if (!nome || !celular) {
        return res
          .status(400)
          .json({ error: "nome e celular são obrigatórios" });
      }

      // Escopo por tenant sem precisar de unique composto:
      const upd = await prisma.contato.updateMany({
        where: { id, tenantId },
        data: { nome, celular },
      });

      if (upd.count === 0) {
        return res.status(404).json({ error: "Contato não encontrado" });
      }

      // Retorna o registro (consulta por id é OK, já garantimos escopo acima)
      const data = await prisma.contato.findUnique({ where: { id } });
      return res.json({ data });
    }

    if (req.method === "DELETE") {
      // Escopo por tenant sem unique composto:
      const del = await prisma.contato.deleteMany({
        where: { id, tenantId },
      });

      if (del.count === 0) {
        return res.status(404).json({ error: "Contato não encontrado" });
      }

      return res.status(204).end();
    }

    return res.status(405).end();
  } catch (e: any) {
    if (e.message === "NO_TENANT") {
      return res.status(401).json({ error: "Não autenticado" });
    }
    console.error(e);
    return res.status(500).json({ error: "Erro na API de contatos" });
  }
}
