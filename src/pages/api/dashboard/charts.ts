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
    // ⚠️ não usamos sessionTenantId aqui para evitar cair num tenant "raiz" sem dados
    return (cookieTenant || queryTenant || null) as string | null;
  }
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
    if (!session?.user)
      return res.status(401).json({ ok: false, message: "Unauthorized" });

    const tenantId = resolveTenant(req, session);
    const tenantParam = tenantId; // string | null

    // (${tenantParam}::text IS NULL OR campo = ${tenantParam}) permite "todos" quando null
    const rows: Array<{ day: string; minutes: number }> =
      await prisma.$queryRaw`
      SELECT
        to_char(date_trunc('day', "horaFinalizacao"), 'YYYY-MM-DD') AS day,
        SUM(EXTRACT(EPOCH FROM ("horaFinalizacao" - "horaInicio")))/60 AS minutes
      FROM "Parada"
      WHERE
        (${tenantParam}::text IS NULL OR "tenantId" = ${tenantParam})
        AND "horaFinalizacao" IS NOT NULL
        AND "horaInicio" >= NOW() - interval '30 days'
      GROUP BY 1
      ORDER BY 1 ASC;
    `;

    const byReason: Array<{ motivo: string; qtd: number }> =
      await prisma.$queryRaw`
      SELECT "motivo" AS motivo, COUNT(*)::int AS qtd
      FROM "Parada"
      WHERE
        (${tenantParam}::text IS NULL OR "tenantId" = ${tenantParam})
        AND "horaInicio" >= NOW() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC;
    `;

    const bySecao: Array<{ secao: string; qtd: number }> =
      await prisma.$queryRaw`
      SELECT
        COALESCE(s."nome", 'Sem seção') AS secao,
        COUNT(*)::int AS qtd
      FROM "Parada" p
      LEFT JOIN "Maquina" m ON m.id = p."maquinaId"
      LEFT JOIN "Secao"   s ON s.id = m."secaoId"
      WHERE
        (${tenantParam}::text IS NULL OR p."tenantId" = ${tenantParam})
        AND p."horaInicio" >= NOW() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC;
    `;

    return res.json({
      ok: true,
      data: {
        downtimePerDay: rows,
        paradasPorMotivo: byReason,
        paradasPorSecao: bySecao,
      },
    });
  } catch (e: any) {
    console.error("[/api/dashboard/chart] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, message: "Internal server error" });
  }
}
