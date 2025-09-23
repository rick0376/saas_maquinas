// src/pages/api/paradas/[id]/finalizar.ts
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

// ajuda a mapear categoria -> status de máquina
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
  if (req.method !== "POST") return res.status(405).json({ ok: false });

  const { id } = req.query as { id: string };
  if (!id)
    return res.status(400).json({ ok: false, message: "ID obrigatório" });

  try {
    // Sessão e tenant efetivo
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user)
      return res.status(401).json({ ok: false, message: "Não autenticado" });

    const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
    const effectiveTenantId = resolveTenant(req, session); // string | null
    const sessionTenantId = (session.user as any)?.tenantId as
      | string
      | undefined;

    // Carrega parada com tenant da máquina
    const p = await prisma.parada.findUnique({
      where: { id },
      select: {
        horaInicio: true,
        maquinaId: true,
        maquina: { select: { tenantId: true } },
      },
    });
    if (!p) return res.status(404).json({ ok: false });

    const paradaTenantId = p.maquina.tenantId;

    // Regras de acesso:
    // - USER/ADMIN: só o tenant da sessão
    if (role !== "SUPERADMIN") {
      if (!sessionTenantId || paradaTenantId !== sessionTenantId) {
        return res.status(403).json({ ok: false, message: "Acesso negado" });
      }
    } else {
      // - SUPERADMIN:
      //   * effectiveTenantId null => agregado (qualquer)
      //   * effectiveTenantId definido => restringe a ele
      if (effectiveTenantId && paradaTenantId !== effectiveTenantId) {
        return res.status(403).json({
          ok: false,
          message: "Acesso negado (tenant selecionado não confere)",
        });
      }
    }

    // Usa horaFinalizacao do body (se enviada) ou agora
    const bodyHora = (req.body?.horaFinalizacao as string | undefined) ?? null;
    const horaFinalizacao = bodyHora ? new Date(bodyHora) : new Date();
    if (Number.isNaN(horaFinalizacao.getTime())) {
      return res
        .status(400)
        .json({ ok: false, message: "horaFinalizacao inválida" });
    }

    const diffMin = Math.max(
      0,
      Math.round(
        (horaFinalizacao.getTime() - new Date(p.horaInicio).getTime()) / 60000
      )
    );

    // Atualiza a parada e recalcula o status da máquina considerando outras abertas
    await prisma.$transaction(async (tx) => {
      await tx.parada.update({
        where: { id },
        data: {
          horaFinalizacao,
          tempoIntervencao: diffMin,
          funcionando: true,
        },
      });

      // Existe outra parada ABERTA para esta máquina?
      const outraAberta = await tx.parada.findFirst({
        where: {
          maquinaId: p.maquinaId,
          tenantId: paradaTenantId,
          horaFinalizacao: null,
        },
        orderBy: { horaInicio: "desc" },
        select: { categoria: true },
      });

      if (!outraAberta) {
        // sem abertas -> máquina volta a ATIVA
        await tx.maquina.update({
          where: { id: p.maquinaId },
          data: { status: "ATIVA" as any },
        });
      } else {
        // com aberta -> status conforme a categoria da aberta
        await tx.maquina.update({
          where: { id: p.maquinaId },
          data: { status: statusFromCategoria(outraAberta.categoria) as any },
        });
      }
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("[/api/paradas/[id]/finalizar] ERROR:", e);
    return res.status(500).json({ ok: false });
  }
}
