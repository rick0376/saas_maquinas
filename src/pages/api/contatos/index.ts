import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireTenantId } from "@/lib/auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const tenantId = await requireTenantId(req, res);

    if (req.method === "GET") {
      const contatos = await prisma.contato.findMany({
        where: { tenantId },
        orderBy: { nome: "asc" },
      });
      return res.json({ data: contatos });
    }

    if (req.method === "POST") {
      const { nome, celular } = req.body ?? {};
      if (!nome || !celular) {
        return res
          .status(400)
          .json({ error: "nome e celular são obrigatórios" });
      }

      const c = await prisma.contato.create({
        data: { tenantId, nome, celular },
      });
      return res.status(201).json({ data: c });
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
