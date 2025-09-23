import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

// util simples p/ ler cookies do request
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

// resolve tenant efetivo:
// - SUPERADMIN: usa selectedTenantId (cookie) OU tenantId da sessão OU null (agrega)
// - USER/ADMIN: sempre o tenantId da sessão
function resolveTenant(req: NextApiRequest, session: any): string | null {
  const role = (session?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;
  const sessionTenantId = (session?.user as any)?.tenantId as
    | string
    | undefined;

  if (role === "SUPERADMIN") {
    const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
    return (cookieTenant || sessionTenantId || null) as string | null;
  }
  return (sessionTenantId ?? null) as string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  if (req.method === "GET") {
    try {
      const tenantId = resolveTenant(req, session);
      const where = tenantId ? { tenantId } : {}; // null => agregado (SUPERADMIN)
      const maquinas = await prisma.maquina.findMany({
        where,
        orderBy: [{ nome: "asc" }],
        include: { secao: { select: { id: true, nome: true } } },
      });
      return res.json({ data: maquinas });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Erro ao carregar máquinas" });
    }
  }

  if (req.method === "POST") {
    try {
      const tenantId = resolveTenant(req, session);
      if (!tenantId) {
        // SUPERADMIN sem seleção de cliente
        return res
          .status(400)
          .json({ error: "Selecione um cliente para criar máquinas." });
      }

      const { codigo, nome, status, secaoId } = req.body ?? {};
      if (!codigo || !nome) {
        return res
          .status(400)
          .json({ error: "codigo e nome são obrigatórios" });
      }

      const m = await prisma.maquina.create({
        data: {
          tenantId,
          codigo,
          nome,
          status: status || "ATIVA",
          secaoId: secaoId || null,
        },
      });

      return res.status(201).json({ data: m });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Erro na criação de máquina" });
    }
  }

  return res.status(405).end();
}
