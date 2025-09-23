// src/pages/api/maquinas/[id]/paradas.ts
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET")
    return res.status(405).json({ ok: false, error: "Method not allowed" });

  const { id } = req.query;
  if (!id || typeof id !== "string")
    return res.status(400).json({ ok: false, error: "id inválido" });

  // filtros opcionais
  const status =
    (req.query.status as string | undefined)?.toUpperCase() || "TODAS";
  const inicioDe = req.query.inicioDe
    ? new Date(String(req.query.inicioDe))
    : undefined;
  const inicioAte = req.query.inicioAte
    ? new Date(String(req.query.inicioAte))
    : undefined;

  try {
    // Sessão + tenant efetivo
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user)
      return res.status(401).json({ ok: false, error: "Não autenticado" });
    const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
    const effectiveTenantId = resolveTenant(req, session); // string | null
    const sessionTenantId = (session.user as any)?.tenantId as
      | string
      | undefined;

    // Busca a máquina para validar o tenant
    const maquina = await prisma.maquina.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!maquina)
      return res
        .status(404)
        .json({ ok: false, error: "Máquina não encontrada" });

    // Regras de acesso:
    // - USER/ADMIN: só podem acessar máquinas do próprio tenant
    if (role !== "SUPERADMIN") {
      if (!sessionTenantId || maquina.tenantId !== sessionTenantId) {
        return res.status(403).json({ ok: false, error: "Acesso negado" });
      }
    } else {
      // - SUPERADMIN:
      //   * Se effectiveTenantId = null (agregado): pode ver qualquer máquina
      //   * Se effectiveTenantId definido: só máquinas desse tenant
      if (effectiveTenantId && maquina.tenantId !== effectiveTenantId) {
        return res
          .status(403)
          .json({
            ok: false,
            error: "Acesso negado (tenant selecionado não confere)",
          });
      }
    }

    // Monta o filtro de paradas
    const where: any = { maquinaId: id };
    if (status === "ATIVA") where.horaFinalizacao = null;
    if (status === "FINALIZADA") where.horaFinalizacao = { not: null };
    if (inicioDe)
      where.horaInicio = { ...(where.horaInicio || {}), gte: inicioDe };
    if (inicioAte)
      where.horaInicio = { ...(where.horaInicio || {}), lte: inicioAte };

    const paradas = await prisma.parada.findMany({
      where,
      orderBy: { horaInicio: "desc" },
      include: { maquina: { select: { id: true, nome: true, codigo: true } } },
    });

    return res.status(200).json({ ok: true, data: paradas });
  } catch (e) {
    console.error("[/api/maquinas/[id]/paradas] ERROR:", e);
    return res.status(500).json({ ok: false, error: "Erro ao buscar paradas" });
  }
}
