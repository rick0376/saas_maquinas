// src/pages/api/operacao/paradas/start.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

/* ===== Helpers de tenant ===== */
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}
function resolveTenant(req: NextApiRequest, session: any): string | null {
  const role = session?.user?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;
  const sessionTenantId = session?.user?.tenantId as string | undefined;
  if (role === "SUPERADMIN") {
    const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
    return (cookieTenant || sessionTenantId || null) as string | null;
  }
  return (sessionTenantId ?? null) as string | null;
}

/* ===== Tipos locais ===== */
type ParadaTipo = "OPERACIONAL" | "NAO_OPERACIONAL";
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

const CATS_OP: ParadaCategoria[] = [
  "MANUTENCAO_CORRETIVA",
  "MANUTENCAO_PREVENTIVA",
  "SETUP_TROCA_FERRAMENTA",
  "FALTA_MATERIAL",
  "QUALIDADE_INSPECAO",
  "AJUSTE_PROCESSO",
  "ABASTECIMENTO",
  "LIMPEZA",
];
const CATS_NOP: ParadaCategoria[] = [
  "ALMOCO",
  "BANHEIRO",
  "REUNIAO",
  "TREINAMENTO",
  "DDS",
  "OUTROS_NAO_OPERACIONAL",
];

function isCategoria(v: any): v is ParadaCategoria {
  return [...CATS_OP, ...CATS_NOP].includes(v);
}
function isTipo(v: any): v is ParadaTipo {
  return v === "OPERACIONAL" || v === "NAO_OPERACIONAL";
}

/** Prioriza a CATEGORIA (se válida) e deduz o TIPO a partir dela.
 *  Sem categoria válida, usa o TIPO (se válido) e escolhe uma categoria padrão do grupo. */
function coerceTipoCategoria(
  rawTipo?: any,
  rawCat?: any
): { tipo: ParadaTipo; categoria: ParadaCategoria } {
  if (isCategoria(rawCat)) {
    const categoria = rawCat as ParadaCategoria;
    const tipo: ParadaTipo = CATS_OP.includes(categoria)
      ? "OPERACIONAL"
      : "NAO_OPERACIONAL";
    return { tipo, categoria };
  }
  const tipo: ParadaTipo = isTipo(rawTipo) ? rawTipo : "OPERACIONAL";
  const pool = tipo === "OPERACIONAL" ? CATS_OP : CATS_NOP;
  const categoria = pool[0];
  return { tipo, categoria };
}

/* ===== Handler ===== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Método não permitido" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const body = (req.body || {}) as {
      maquinaId?: string;
      motivo?: string;
      equipeAtuando?: string | null;
      observacao?: string | null;
      horaInicio?: string;
      tipo?: string;
      categoria?: string;
      ignoreOpen?: any;
    };

    const ignoreOpenParam =
      typeof req.query.ignoreOpen !== "undefined"
        ? String(req.query.ignoreOpen)
        : typeof body.ignoreOpen !== "undefined"
        ? String(body.ignoreOpen)
        : "0";
    const ignoreOpen =
      ignoreOpenParam === "1" ||
      ignoreOpenParam === "true" ||
      ignoreOpenParam === "yes";

    const maquinaId = String(body.maquinaId || "");
    const motivo = String(body.motivo || "").trim();
    const equipeAtuando =
      typeof body.equipeAtuando === "string" && body.equipeAtuando.trim()
        ? body.equipeAtuando.trim()
        : null;
    const observacao =
      typeof body.observacao === "string" && body.observacao.trim()
        ? body.observacao.trim()
        : null;

    if (!maquinaId || !motivo) {
      return res.status(400).json({
        ok: false,
        error: "Dados inválidos (máquina e motivo são obrigatórios).",
      });
    }

    let tenantId = resolveTenant(req, session);
    const { tipo, categoria } = coerceTipoCategoria(body.tipo, body.categoria);

    let inicio = new Date();
    if (body.horaInicio) {
      const d = new Date(body.horaInicio);
      if (!isNaN(d.getTime())) inicio = d;
    }

    // (1) Buscar máquina fora da transação
    const maquina = await prisma.maquina.findFirst({
      where: tenantId ? { id: maquinaId, tenantId } : { id: maquinaId },
      select: { id: true, tenantId: true },
    });
    if (!maquina) {
      return res
        .status(404)
        .json({ ok: false, error: "Máquina não encontrada no cliente atual." });
    }
    if (!tenantId) tenantId = maquina.tenantId;

    // (2) Checar “já aberta” fora da transação
    const jaAberta = await prisma.parada.findFirst({
      where: { maquinaId, tenantId, horaFinalizacao: null },
      select: { id: true },
    });
    if (jaAberta && !ignoreOpen) {
      return res.status(409).json({
        ok: false,
        code: "ALREADY_OPEN",
        error:
          "Já existe uma parada em aberto para esta máquina. Deseja abrir outra?",
      });
    }

    // (3) Criar + atualizar status dentro da transação
    const result = await prisma.$transaction(async (tx) => {
      const parada = await tx.parada.create({
        data: {
          tenantId: tenantId!, // garantido
          maquinaId,
          horaInicio: inicio,
          motivo,
          equipeAtuando,
          observacao,
          tipo: tipo as any,
          categoria: categoria as any,
        },
        select: { id: true },
      });

      const isMaint =
        categoria === "MANUTENCAO_CORRETIVA" ||
        categoria === "MANUTENCAO_PREVENTIVA";

      await tx.maquina.update({
        where: { id: maquinaId },
        data: { status: (isMaint ? "MANUTENCAO" : "PARADA") as any },
      });

      return parada;
    });

    return res.status(200).json({ ok: true, data: result });
  } catch (err: any) {
    if (err?.code === 404 || err?.message === "MACHINE_NOT_FOUND") {
      return res
        .status(404)
        .json({ ok: false, error: "Máquina não encontrada no cliente atual." });
    }
    if (err?.code === 409 || err?.message === "ALREADY_OPEN") {
      return res.status(409).json({
        ok: false,
        code: "ALREADY_OPEN",
        error: "Já existe uma parada em aberto para esta máquina.",
      });
    }
    console.error("[/api/operacao/paradas/start] ERROR:", err);
    return res.status(500).json({ ok: false, error: "Erro interno" });
  }
}
