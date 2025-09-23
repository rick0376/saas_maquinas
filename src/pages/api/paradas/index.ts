import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authGuard";
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const ctx = await requireAuth(req, res);
  if (!ctx) return;
  const { tenantId } = ctx as any;
  try {
    if (req.method === "GET") {
      const data = await prisma.parada.findMany({
        where: { tenantId },
        include: { maquina: true },
      });
      return res.json({ ok: true, data });
    }
    if (req.method === "POST") {
      const { maquinaId, horaInicio, motivo, equipeAtuando, observacao } =
        req.body;
      const data = await prisma.parada.create({
        data: {
          tenantId,
          maquinaId,
          horaInicio: new Date(horaInicio),
          motivo,
          equipeAtuando,
          observacao,
          funcionando: false,
        },
      });
      return res.json({ ok: true, data });
    }
    res
      .status(405)
      .json({
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Método não suportado" },
      });
  } catch (e: any) {
    res
      .status(500)
      .json({ ok: false, error: { code: "INTERNAL", message: e.message } });
  }
}
