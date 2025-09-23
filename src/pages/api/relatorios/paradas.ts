// src/pages/api/relatorios/paradas.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

type Role = "USER" | "ADMIN" | "SUPERADMIN";
type SessionUser = Session["user"] & { role?: Role; tenantId?: string };
type MySession = (Session & { user?: SessionUser }) | null;

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
  | "OUTROS_NAO_OPERACIONAL"
  | string
  | null;

type Ok = {
  ok: true;
  data: Array<{
    id: string;
    horaInicio: string;
    horaFinalizacao: string | null;
    motivo: string;
    observacao: string | null;
    equipeAtuando: string | null;
    tempoIntervencao: number | null;
    tipo: ParadaTipo | null;
    categoria: ParadaCategoria;
    maquina: {
      id: string;
      nome: string;
      codigo: string;
      secao: { id: string; nome: string | null } | null;
    } | null;
  }>;
  tenantName: string;
};
type Err = { ok: false; error?: string };

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}
function parseDateLoose(v?: string | string[] | null): Date | null {
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  const d = new Date(s || "");
  return isNaN(d.getTime()) ? null : d;
}
function defaultWindow(): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}
function resolveTenant(req: NextApiRequest, session: MySession): string | null {
  const role = session?.user?.role as Role | undefined;
  const sessionTenantId = session?.user?.tenantId;
  if (role === "SUPERADMIN") {
    const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
    const queryTenant =
      typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  return (sessionTenantId ?? null) as string | null;
}

// mapas para inferir tipo a partir da categoria (corrige dados antigos)
const CATS_OP = new Set<ParadaCategoria>([
  "MANUTENCAO_CORRETIVA",
  "MANUTENCAO_PREVENTIVA",
  "SETUP_TROCA_FERRAMENTA",
  "FALTA_MATERIAL",
  "QUALIDADE_INSPECAO",
  "AJUSTE_PROCESSO",
  "ABASTECIMENTO",
  "LIMPEZA",
]);
const CATS_NOP = new Set<ParadaCategoria>([
  "ALMOCO",
  "BANHEIRO",
  "REUNIAO",
  "TREINAMENTO",
  "DDS",
  "OUTROS_NAO_OPERACIONAL",
]);
function inferTipo(
  tipo?: ParadaTipo | string | null,
  cat?: ParadaCategoria
): ParadaTipo | null {
  if (tipo === "OPERACIONAL" || tipo === "NAO_OPERACIONAL") return tipo;
  if (cat && CATS_NOP.has(cat)) return "NAO_OPERACIONAL";
  if (cat && CATS_OP.has(cat)) return "OPERACIONAL";
  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const session = (await getServerSession(
      req,
      res,
      authOptions
    )) as MySession;
    if (!session?.user)
      return res.status(401).json({ ok: false, error: "Unauthorized" });

    const tenantId = resolveTenant(req, session);
    const {
      from: qFrom,
      to: qTo,
      startDate,
      endDate,
      status: qStatus,
      tipo: qTipo,
      categoria: qCategoria,
      maquinaId,
      secaoId,
      q,
    } = req.query as any;

    let from = parseDateLoose(qFrom) || parseDateLoose(startDate);
    let to = parseDateLoose(qTo) || parseDateLoose(endDate);
    if (!from || !to) ({ from, to } = defaultWindow());
    if (
      (qFrom || startDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(qFrom || startDate))
    )
      from.setHours(0, 0, 0, 0);
    if ((qTo || endDate) && /^\d{4}-\d{2}-\d{2}$/.test(String(qTo || endDate)))
      to.setHours(23, 59, 59, 999);

    const status = (qStatus || "todos") as
      | "todos"
      | "em_aberto"
      | "finalizadas";
    const where: any = { horaInicio: { gte: from, lte: to } };
    if (tenantId) where.tenantId = tenantId;
    if (status === "em_aberto") where.horaFinalizacao = null;
    if (status === "finalizadas") where.horaFinalizacao = { not: null };
    if (maquinaId) where.maquinaId = maquinaId;
    if (qCategoria) where.categoria = qCategoria;
    if (secaoId) where.maquina = { secaoId };
    if (q && String(q).trim()) {
      const txt = String(q).trim();
      where.OR = [
        { motivo: { contains: txt, mode: "insensitive" } },
        { observacao: { contains: txt, mode: "insensitive" } },
        { maquina: { nome: { contains: txt, mode: "insensitive" } } },
        { maquina: { codigo: { contains: txt, mode: "insensitive" } } },
      ];
    }
    if (qTipo) where.tipo = qTipo;

    const rows = await prisma.parada.findMany({
      where,
      orderBy: { horaInicio: "desc" },
      select: {
        id: true,
        horaInicio: true,
        horaFinalizacao: true,
        motivo: true,
        observacao: true,
        equipeAtuando: true,
        tempoIntervencao: true,
        tipo: true,
        categoria: true,
        maquina: {
          select: {
            id: true,
            nome: true,
            codigo: true,
            secao: { select: { id: true, nome: true } },
          },
        },
      },
    });

    let tenantName = "Todos (agregado)";
    if (tenantId) {
      const t = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      tenantName = t?.name || "Cliente";
    }

    const data: Ok["data"] = rows.map((r) => ({
      id: r.id,
      horaInicio: r.horaInicio.toISOString(),
      horaFinalizacao: r.horaFinalizacao
        ? r.horaFinalizacao.toISOString()
        : null,
      motivo: r.motivo,
      observacao: r.observacao,
      equipeAtuando: r.equipeAtuando,
      tempoIntervencao: r.tempoIntervencao,
      tipo: inferTipo(r.tipo as any, r.categoria as any),
      categoria: (r.categoria as any) ?? null,
      maquina: r.maquina
        ? {
            id: r.maquina.id,
            nome: r.maquina.nome,
            codigo: r.maquina.codigo,
            secao: r.maquina.secao
              ? { id: r.maquina.secao.id, nome: r.maquina.secao.nome }
              : null,
          }
        : null,
    }));

    return res.status(200).json({ ok: true, data, tenantName });
  } catch (e) {
    console.error("[/api/relatorios/paradas] ERROR:", e);
    return res.status(500).json({ ok: false, error: "Falha interna" });
  }
}
