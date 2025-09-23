// src/pages/api/paradas/[id]/reabrir.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function resolveTenant(req: NextApiRequest, session: any) {
  const role = (session?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;
  const isSuper = role === "SUPERADMIN";
  const sessionTenantId = (session?.user as any)?.tenantId as
    | string
    | undefined;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (isSuper) {
    // prioridade: cookie -> query -> sessão -> null (agregado)
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  // USER/ADMIN: sempre o tenant da sessão
  return (sessionTenantId ?? null) as string | null;
}

type ParadaCategoria =
  | "MANUTENCAO_CORRETIVA"
  | "MANUTENCAO_PREVENTIVA"
  | "SETUP_TROCA_FERRAMENTA"
  | "FALTA_MATERIAL"
  | "QUALIDADE_INSPECAO"
  | "AJUSTE_PROCESSO"
  | "ABASTECIMENTO"
  | "LIMPEZA"
  | "ALMOCO"
  | "BANHEIRO"
  | "REUNIAO"
  | "TREINAMENTO"
  | "DDS"
  | "OUTROS_NAO_OPERACIONAL";

function statusFromCategoria(cat?: string | null) {
  const c = (cat || "OUTROS_NAO_OPERACIONAL") as ParadaCategoria;
  const isMaint = c === "MANUTENCAO_CORRETIVA" || c === "MANUTENCAO_PREVENTIVA";
  return (isMaint ? "MANUTENCAO" : "PARADA") as "MANUTENCAO" | "PARADA";
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { id } = req.query;
  if (!id || typeof id !== "string")
    return res.status(400).json({ ok: false, error: "id inválido" });

  try {
    // Sessão e tenant efetivo
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user)
      return res.status(401).json({ ok: false, error: "Não autenticado" });

    const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
    const sessionTenantId = (session.user as any)?.tenantId as
      | string
      | undefined;
    const effectiveTenantId = resolveTenant(req, session); // string | null

    // Busca parada + categoria + tenant da máquina
    const parada = await prisma.parada.findUnique({
      where: { id },
      select: {
        id: true,
        horaFinalizacao: true,
        categoria: true,
        maquinaId: true,
        maquina: { select: { tenantId: true } },
      },
    });
    if (!parada)
      return res
        .status(404)
        .json({ ok: false, error: "Parada não encontrada" });

    const paradaTenantId = parada.maquina.tenantId;

    // Regras de acesso
    if (role !== "SUPERADMIN") {
      if (!sessionTenantId || paradaTenantId !== sessionTenantId) {
        return res.status(403).json({ ok: false, error: "Acesso negado" });
      }
    } else {
      // SUPERADMIN com tenant selecionado deve bater
      if (effectiveTenantId && paradaTenantId !== effectiveTenantId) {
        return res.status(403).json({
          ok: false,
          error: "Acesso negado (tenant selecionado não confere)",
        });
      }
    }

    // Já está aberta? (nada a reabrir)
    if (!parada.horaFinalizacao) {
      return res
        .status(409)
        .json({ ok: false, error: "Parada já está em aberto" });
    }

    // Define status correto com base na CATEGORIA desta parada
    const newStatus = statusFromCategoria(parada.categoria);

    // Reabre a parada e ajusta status da máquina coerente com a categoria
    const result = await prisma.$transaction(async (tx) => {
      const upd = await tx.parada.update({
        where: { id },
        data: {
          horaFinalizacao: null,
          tempoIntervencao: null,
          funcionando: false, // coerente com /desfazer
        },
      });

      await tx.maquina.update({
        where: { id: parada.maquinaId },
        data: { status: newStatus as any },
      });

      return upd;
    });

    return res.status(200).json({ ok: true, data: result });
  } catch (e) {
    console.error("[/api/paradas/[id]/reabrir] ERROR:", e);
    return res.status(500).json({ ok: false, error: "Erro ao reabrir parada" });
  }
}
