// src/pages/api/secoes/index.ts
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
    // prioridade: cookie -> query -> tenant da sessão -> null (agregado)
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  // USER/ADMIN: sempre tenant da sessão
  return (sessionTenantId ?? null) as string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user)
      return res.status(401).json({ error: "Não autenticado" });

    const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
    const tenantId = resolveTenant(req, session);

    if (req.method === "GET") {
      const whereBase = tenantId ? { tenantId } : {}; // SUPERADMIN sem seleção -> agrega todos
      const secoes = await prisma.secao.findMany({
        where: whereBase,
        orderBy: [{ nome: "asc" }],
        select: {
          id: true,
          nome: true,
          descricao: true,
          paiId: true,
          tenantId: true,
        },
      });
      return res.json({ data: secoes });
    }

    if (req.method === "POST") {
      const { nome, descricao, paiId, tenantId: bodyTenantId } = req.body ?? {};
      if (!nome || typeof nome !== "string")
        return res.status(400).json({ error: "nome é obrigatório" });

      // Determina o tenant de destino para criar
      let targetTenantId: string | undefined;

      if (role === "SUPERADMIN") {
        // SUPERADMIN pode escolher: body.tenantId > cookie.selectedTenantId > sessão
        targetTenantId =
          (typeof bodyTenantId === "string" && bodyTenantId) ||
          readCookie(req, "selectedTenantId") ||
          ((session.user as any)?.tenantId as string | undefined);

        if (!targetTenantId) {
          return res
            .status(400)
            .json({
              error: "tenantId é obrigatório para SUPERADMIN ao criar seção",
            });
        }
      } else {
        // USER/ADMIN: sempre do tenant da sessão
        targetTenantId = (session.user as any)?.tenantId;
        if (!targetTenantId)
          return res
            .status(401)
            .json({ error: "Não autenticado (tenant indefinido)" });
      }

      const secao = await prisma.secao.create({
        data: {
          tenantId: targetTenantId,
          nome,
          descricao: descricao || null,
          paiId: paiId || null,
        },
      });
      return res.status(201).json({ data: secao });
    }

    return res.status(405).end();
  } catch (e: any) {
    console.error("[/api/secoes] ERROR:", e);
    return res.status(500).json({ error: "Erro na API de seções" });
  }
}
