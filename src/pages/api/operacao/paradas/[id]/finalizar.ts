// src/pages/api/operacao/paradas/[id]/finalizar.ts
import { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

// util: decide próximo status com base nas categorias ainda abertas
function proximoStatus(categoriasAbertas: Array<string | null | undefined>) {
  const has = (k: string) => categoriasAbertas.some((c) => c === k);

  // 1) prioridade máxima: corretiva
  if (has("MANUTENCAO_CORRETIVA")) return "MANUTENCAO";
  // 2) depois preventiva
  if (has("MANUTENCAO_PREVENTIVA")) return "MANUTENCAO";

  // 3) operacionais
  const OP = new Set([
    "SETUP_TROCA_FERRAMENTA",
    "FALTA_MATERIAL",
    "QUALIDADE_INSPECAO",
    "AJUSTE_PROCESSO",
    "ABASTECIMENTO",
    "LIMPEZA",
  ]);
  if (categoriasAbertas.some((c) => c && OP.has(c))) return "PARADA";

  // 4) não-operacionais
  const NOP = new Set([
    "ALMOCO",
    "BANHEIRO",
    "REUNIAO",
    "TREINAMENTO",
    "DDS",
    "OUTROS_NAO_OPERACIONAL",
  ]);
  if (categoriasAbertas.some((c) => c && NOP.has(c))) return "PARADA";

  // 5) nenhuma aberta
  return "ATIVA";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Método não permitido" });

  const { id } = req.query;
  if (!id || typeof id !== "string")
    return res.status(400).json({ ok: false, error: "ID inválido" });

  try {
    await prisma.$transaction(async (tx) => {
      // 1) finaliza a parada
      const parada = await tx.parada.update({
        where: { id },
        data: { horaFinalizacao: new Date(), funcionando: true },
        select: { maquinaId: true },
      });

      // 2) coleta categorias de outras paradas ABERTAS dessa máquina
      const abertas = await tx.parada.findMany({
        where: { maquinaId: parada.maquinaId, horaFinalizacao: null },
        select: { categoria: true },
      });

      // 3) calcula o próximo status e aplica
      const categoriasAbertas = abertas.map((p) => p.categoria);
      const status = proximoStatus(categoriasAbertas) as any; // "ATIVA" | "PARADA" | "MANUTENCAO"

      await tx.maquina.update({
        where: { id: parada.maquinaId },
        data: { status },
      });
    });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    if (e?.code === "P2025") {
      // registro não encontrado
      return res
        .status(404)
        .json({ ok: false, error: "Parada não encontrada" });
    }
    return res.status(500).json({ ok: false, error: "Erro interno" });
  }
}
