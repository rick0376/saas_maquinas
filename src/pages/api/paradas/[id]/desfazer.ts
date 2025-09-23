// src/pages/api/paradas/[id]/desfazer.ts
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
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const { id } = req.query as { id?: string };
  if (!id) {
    return res
      .status(400)
      .json({ ok: false, message: "Parâmetro 'id' é obrigatório" });
  }

  // aceita ignoreOpen por query ou body
  const ignoreOpenParam =
    typeof req.query.ignoreOpen !== "undefined"
      ? String(req.query.ignoreOpen)
      : typeof req.body?.ignoreOpen !== "undefined"
      ? String(req.body.ignoreOpen)
      : "0";
  const ignoreOpen =
    ignoreOpenParam === "1" ||
    ignoreOpenParam === "true" ||
    ignoreOpenParam === "yes";

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

    // Carrega parada + categoria + tenant da máquina
    const parada = await prisma.parada.findUnique({
      where: { id },
      select: {
        id: true,
        maquinaId: true,
        horaFinalizacao: true,
        categoria: true,
        maquina: { select: { tenantId: true } },
      },
    });

    if (!parada) {
      return res
        .status(404)
        .json({ ok: false, message: "Parada não encontrada" });
    }

    const paradaTenantId = parada.maquina.tenantId;

    // Regras de acesso:
    if (role !== "SUPERADMIN") {
      if (!sessionTenantId || paradaTenantId !== sessionTenantId) {
        return res.status(403).json({ ok: false, message: "Acesso negado" });
      }
    } else {
      if (effectiveTenantId && paradaTenantId !== effectiveTenantId) {
        return res.status(403).json({
          ok: false,
          message: "Acesso negado (tenant selecionado não confere)",
        });
      }
    }

    // Já está aberta? nada a desfazer
    if (!parada.horaFinalizacao) {
      return res
        .status(409)
        .json({
          ok: false,
          code: "ALREADY_OPEN",
          message: "Parada já está em aberto",
        });
    }

    // Existe OUTRA parada aberta na mesma máquina?
    const outraAberta = await prisma.parada.findFirst({
      where: {
        maquinaId: parada.maquinaId,
        horaFinalizacao: null,
        NOT: { id: parada.id },
      },
      select: { id: true },
    });

    if (outraAberta && !ignoreOpen) {
      return res.status(409).json({
        ok: false,
        code: "OTHER_OPEN",
        message:
          "Já existe outra parada em aberto para esta máquina. Deseja reabrir mesmo assim?",
      });
    }

    // Determina status correto a partir da CATEGORIA desta parada reaberta
    const newStatus = statusFromCategoria(parada.categoria);

    await prisma.$transaction([
      prisma.parada.update({
        where: { id },
        data: {
          horaFinalizacao: null,
          tempoIntervencao: null,
          funcionando: false,
        },
      }),
      prisma.maquina.update({
        where: { id: parada.maquinaId },
        data: { status: newStatus as any },
      }),
    ]);

    return res.json({ ok: true });
  } catch (e) {
    console.error("[/api/paradas/[id]/desfazer] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Erro interno ao desfazer finalização" });
  }
}
