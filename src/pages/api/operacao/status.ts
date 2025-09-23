// src/pages/api/operacao/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { Session } from "next-auth";

/* ===== Helpers ===== */
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

type Role = "USER" | "ADMIN" | "SUPERADMIN";
type MySession =
  | (Session & {
      user?: { role?: Role; tenantId?: string };
    })
  | null;

function resolveTenant(req: NextApiRequest, session: MySession): string | null {
  const role = session?.user?.role as Role | undefined;
  const sessionTenantId = session?.user?.tenantId;

  if (role === "SUPERADMIN") {
    const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
    // Sem cookie => agregado (null)
    return (cookieTenant || sessionTenantId || null) as string | null;
  }
  return (sessionTenantId ?? null) as string | null;
}

/* ===== Handler ===== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
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

    const where = {
      horaFinalizacao: null,
      ...(tenantId ? { tenantId } : {}),
    };

    const rows = await prisma.parada.findMany({
      where,
      orderBy: { horaInicio: "desc" },
      include: {
        maquina: {
          select: { id: true, nome: true, codigo: true, status: true },
        },
      },
      // Não precisa de select explícito nos campos da própria Parada;
      // tipo/categoria virão do modelo.
    });

    // Serializa datas + garante shape estável
    const data = rows.map((p) => ({
      id: p.id,
      horaInicio: p.horaInicio.toISOString(),
      motivo: p.motivo,
      equipeAtuando: p.equipeAtuando ?? null,
      observacao: p.observacao ?? null,
      // enums do Prisma -> strings
      tipo: p.tipo ?? null,
      categoria: p.categoria ?? null,
      maquina: p.maquina
        ? {
            id: p.maquina.id,
            nome: p.maquina.nome,
            codigo: p.maquina.codigo,
            status: p.maquina.status, // enum -> string
          }
        : null,
    }));

    return res.status(200).json({ ok: true, data });
  } catch (e: any) {
    console.error("[/api/operacao/status] ERROR:", e);
    return res
      .status(500)
      .json({ ok: false, error: { code: "INTERNAL", message: e.message } });
  }
}
