// src/pages/api/relatorios/paradas.ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

/* ======================= Tipos auxiliares ======================= */
type Role = "USER" | "ADMIN" | "SUPERADMIN";
type SessionUser = Session["user"] & {
  id?: string;
  role?: Role;
  tenantId?: string;
};
type MySession = (Session & { user?: SessionUser }) | null;

// OBS: inclui tipo e categoria no retorno
type Ok = {
  ok: true;
  data: Array<{
    id: string;
    horaInicio: Date;
    horaFinalizacao: Date | null;
    motivo: string;
    observacao: string | null;
    equipeAtuando: string | null;
    tempoIntervencao: number | null;
    tipo: "OPERACIONAL" | "NAO_OPERACIONAL" | null;
    categoria: string | null;
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

/* ======================= Helpers ======================= */
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/** Aceita string YYYY-MM-DD ou ISO parcial; não força UTC. */
function parseDateLoose(v?: string | string[] | null): Date | null {
  if (!v) return null;
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Janela default: últimos 7 dias (00:00 até 23:59:59 de hoje). */
function defaultWindow(): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/**
 * Resolve o tenant efetivo:
 * - SUPERADMIN: cookie selectedTenantId -> query ?tenantId -> session.user.tenantId -> null (agregado)
 * - USER/ADMIN: sempre session.user.tenantId (se faltar => 401)
 */
function resolveTenant(req: NextApiRequest, session: MySession): string | null {
  const role = session?.user?.role as Role | undefined;
  const isSuper = role === "SUPERADMIN";
  const sessionTenantId = session?.user?.tenantId;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (isSuper) {
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  // USER/ADMIN
  return (sessionTenantId ?? null) as string | null;
}

/* ======================= Handler ======================= */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | Err>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const session = (await getServerSession(
      req,
      res,
      authOptions
    )) as MySession;

    if (!session?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const tenantId = resolveTenant(req, session);

    // ===== Query params aceitos =====
    const {
      from: qFrom,
      to: qTo,
      startDate,
      endDate,
      status: qStatus,
      // novos:
      tipo: qTipo,
      categoria: qCategoria,
      maquinaId: qMaquinaId,
      secaoId: qSecaoId,
      q, // busca livre
    } = req.query as {
      from?: string;
      to?: string;
      startDate?: string;
      endDate?: string;
      status?: "todos" | "em_aberto" | "finalizadas";
      tipo?: "OPERACIONAL" | "NAO_OPERACIONAL" | "";
      categoria?: string | "";
      maquinaId?: string | "";
      secaoId?: string | "";
      q?: string | "";
    };

    // ===== Janela de tempo =====
    let from = parseDateLoose(qFrom) || parseDateLoose(startDate);
    let to = parseDateLoose(qTo) || parseDateLoose(endDate);
    if (!from || !to) {
      const w = defaultWindow();
      from = from || w.from;
      to = to || w.to;
    }

    // Se usuário passou yyyy-mm-dd, ajusta bordas do dia
    const rawStart = (qFrom || startDate || "").toString();
    const rawEnd = (qTo || endDate || "").toString();
    if (rawStart && /^\d{4}-\d{2}-\d{2}$/.test(rawStart)) {
      from!.setHours(0, 0, 0, 0);
    }
    if (rawEnd && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) {
      to!.setHours(23, 59, 59, 999);
    }

    const status = (qStatus || "todos") as
      | "todos"
      | "em_aberto"
      | "finalizadas";

    // ===== WHERE base =====
    const where: any = {
      horaInicio: { gte: from, lte: to },
    };
    if (tenantId) where.tenantId = tenantId;
    if (status === "em_aberto") where.horaFinalizacao = null;
    if (status === "finalizadas") where.horaFinalizacao = { not: null };

    // ===== Filtros novos =====
    // tipo
    if (qTipo === "OPERACIONAL" || qTipo === "NAO_OPERACIONAL") {
      where.tipo = qTipo;
    }
    // categoria (igualdade exata no enum/string salvo)
    if (qCategoria && qCategoria !== "") {
      where.categoria = qCategoria;
    }
    // máquina
    if (qMaquinaId && qMaquinaId !== "") {
      where.maquinaId = qMaquinaId;
    }
    // seção (via relação de máquina)
    if (qSecaoId && qSecaoId !== "") {
      where.maquina = { ...(where.maquina || {}), secaoId: qSecaoId };
    }
    // busca livre: motivo / máquina.nome / máquina.codigo
    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { motivo: { contains: term, mode: "insensitive" } },
        { observacao: { contains: term, mode: "insensitive" } },
        { maquina: { nome: { contains: term, mode: "insensitive" } } },
        { maquina: { codigo: { contains: term, mode: "insensitive" } } },
      ];
    }

    // ===== Query =====
    const data = await prisma.parada.findMany({
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
        tipo: true, // <-- novos campos
        categoria: true, // <--
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

    // ===== Nome do tenant para cabeçalho =====
    let tenantName = "Todos (agregado)";
    if (tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      tenantName = tenant?.name || "Cliente";
    }

    return res.status(200).json({ ok: true, data, tenantName });
  } catch (e) {
    console.error("[/api/relatorios/paradas] ERROR:", e);
    return res.status(500).json({ ok: false, error: "Falha interna" });
  }
}
