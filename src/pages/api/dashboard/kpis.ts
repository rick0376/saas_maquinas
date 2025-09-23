import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]"; // relativo a /api/dashboard

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * Regra:
 * - SUPERADMIN: cookie(selectedTenantId) -> query(?tenantId) -> NULL (agrega todos)
 * - USER/ADMIN: sempre o tenantId da sessão
 */
function resolveTenant(req: NextApiRequest, session: any): string | null {
  const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
  const isSuper = role === "SUPERADMIN";
  const sessionTenantId = (session.user as any)?.tenantId as string | undefined;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (isSuper) {
    // ⚠️ NÃO usar sessionTenantId aqui para não retornar 0 quando for um "tenant raiz"
    return (cookieTenant || queryTenant || null) as string | null;
  }

  // Usuários comuns: sempre o tenant da sessão
  return (sessionTenantId ?? null) as string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }

    const tenantId = resolveTenant(req, session);
    // tenantId === null => agrega TODOS os tenants (SUPERADMIN sem seleção)
    const whereBase = tenantId ? { tenantId } : {};

    const [machinesCount, openParadasCount, lastParadas] = await Promise.all([
      prisma.maquina.count({ where: whereBase }),
      prisma.parada.count({ where: { ...whereBase, horaFinalizacao: null } }),
      prisma.parada.findMany({
        where: {
          ...whereBase,
          horaInicio: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { horaInicio: true, horaFinalizacao: true },
      }),
    ]);

    const finalized = lastParadas.filter((p) => p.horaFinalizacao);
    const mttr = finalized.length
      ? Math.round(
          finalized.reduce((acc, p) => {
            const fim = (p.horaFinalizacao as Date).getTime();
            const ini = p.horaInicio.getTime();
            return acc + (fim - ini) / 60000;
          }, 0) / finalized.length
        )
      : 0;

    // Disponibilidade estimada em 30 dias
    const totalMinutes = machinesCount * 30 * 24 * 60;
    const downMinutes = finalized.reduce((acc, p) => {
      const fim = (p.horaFinalizacao as Date).getTime();
      const ini = p.horaInicio.getTime();
      return acc + (fim - ini) / 60000;
    }, 0);

    const disponibilidade =
      totalMinutes > 0
        ? Math.max(
            0,
            Math.min(100, Math.round((1 - downMinutes / totalMinutes) * 100))
          )
        : 100;

    return res.json({
      ok: true,
      data: {
        maquinasAtivas: machinesCount,
        paradasAbertas: openParadasCount,
        mttrMin: mttr,
        disponibilidadePct: disponibilidade,
      },
    });
  } catch (e: any) {
    console.error("[/api/dashboard/kpi] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
