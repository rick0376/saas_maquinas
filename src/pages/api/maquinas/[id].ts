import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

// Lê cookie cru do request
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

// Resolve tenant efetivo para a operação
function resolveTenant(
  req: NextApiRequest,
  session: any
): {
  tenantId: string | null;
  role: "USER" | "ADMIN" | "SUPERADMIN";
} {
  const role =
    ((session?.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN") || "USER";
  const sessionTenantId = (session?.user as any)?.tenantId as
    | string
    | undefined;

  if (role === "SUPERADMIN") {
    const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
    return {
      tenantId: (cookieTenant || sessionTenantId || null) as string | null,
      role,
    };
  }
  return { tenantId: (sessionTenantId ?? null) as string | null, role };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query as { id: string };

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Não autenticado" });
  }

  const { tenantId: effectiveTenant, role } = resolveTenant(req, session);

  // Para operações destrutivas/escrita, exigimos tenant definido
  if ((req.method === "PUT" || req.method === "DELETE") && !effectiveTenant) {
    // SUPERADMIN sem cliente selecionado
    return res
      .status(400)
      .json({ error: "Selecione um cliente para editar/excluir máquinas." });
  }

  try {
    // Sempre valida a posse da máquina antes de alterar/excluir
    const current = await prisma.maquina.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });

    if (!current) {
      return res.status(404).json({ error: "Máquina não encontrada" });
    }

    // USER/ADMIN: só podem tocar no próprio tenant
    // SUPERADMIN: precisa estar com o mesmo tenant selecionado
    if (effectiveTenant && current.tenantId !== effectiveTenant) {
      return res
        .status(403)
        .json({ error: "Você não tem acesso a esta máquina" });
    }

    if (req.method === "PUT") {
      const { codigo, nome, status, secaoId } = req.body ?? {};

      if (!codigo || !nome) {
        return res
          .status(400)
          .json({ error: "codigo e nome são obrigatórios" });
      }

      const updated = await prisma.maquina.update({
        where: { id },
        data: {
          // ⚠️ Não alteramos tenantId aqui
          codigo,
          nome,
          status,
          secaoId: secaoId || null,
        },
      });

      return res.json({ data: updated });
    }

    if (req.method === "DELETE") {
      await prisma.maquina.delete({ where: { id } });
      return res.status(204).end();
    }

    return res.status(405).end();
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Erro na API de máquinas" });
  }
}
