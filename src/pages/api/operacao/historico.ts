// src/pages/api/operacao/historico.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { prisma } from "@/lib/prisma";

type Ok = {
  data: Array<{
    id: string;
    horaInicio: string; // ISO
    horaFinalizacao: string; // ISO
    motivo: string;
    tipo: string | null; // enums como string
    categoria: string | null; // enums como string
    maquina: {
      id: string;
      nome: string;
      codigo: string;
      status: string; // enum -> string
    } | null;
  }>;
};

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Ok | { ok: false; error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const tenantId = resolveTenant(req, session);
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
    const maquinaId =
      typeof req.query.maquinaId === "string" ? req.query.maquinaId : undefined;

    const where: any = { horaFinalizacao: { not: null } };
    if (tenantId) where.tenantId = tenantId;
    if (maquinaId) where.maquinaId = maquinaId;

    const rows = await prisma.parada.findMany({
      where,
      orderBy: { horaFinalizacao: "desc" },
      take: limit,
      select: {
        id: true,
        horaInicio: true,
        horaFinalizacao: true,
        motivo: true,
        tipo: true,
        categoria: true,
        maquina: {
          select: { id: true, nome: true, codigo: true, status: true },
        },
      },
    });

    const data: Ok["data"] = rows.map((r) => ({
      id: r.id,
      horaInicio: r.horaInicio.toISOString(),
      horaFinalizacao: (r.horaFinalizacao as Date).toISOString(), // garantido not null no where
      motivo: r.motivo,
      tipo: r.tipo ?? null,
      categoria: r.categoria ?? null,
      maquina: r.maquina
        ? {
            id: r.maquina.id,
            nome: r.maquina.nome,
            codigo: r.maquina.codigo,
            status: String(r.maquina.status),
          }
        : null,
    }));

    // shape que o front espera: { data: [...] }
    return res.status(200).json({ data });
  } catch (e: any) {
    console.error("[/api/operacao/historico] ERROR:", e);
    return res.status(500).json({ ok: false, error: "Falha interna" });
  }
}
