import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

type Role = "USER" | "ADMIN" | "SUPERADMIN";

function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query as { id: string };
  const session = await getServerSession(req, res, authOptions);
  const sUser = session?.user as any;

  if (!sUser) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }

  const myRole: Role = sUser.role || "USER";
  const myTenantId: string | null = sUser.tenantId ?? null;

  const adminMode = readCookie(req, "adminMode") === "1";
  const selectedTenantId = readCookie(req, "selectedTenantId") || null;
  const isSuper = myRole === "SUPERADMIN";
  const isAggregated = isSuper && (!adminMode || !selectedTenantId);

  // Carrega alvo
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, tenantId: true },
  });
  if (!target)
    return res
      .status(404)
      .json({ ok: false, message: "Usuário não encontrado." });

  // Autorização de escopo:
  // SUPER agregado => pode tudo
  // SUPER “dentro de cliente” => só no cliente atual
  // ADMIN/USER => só no próprio tenant
  const inScope = isAggregated
    ? true
    : isSuper
    ? target.tenantId === selectedTenantId
    : target.tenantId === myTenantId;

  if (!inScope) {
    return res
      .status(403)
      .json({ ok: false, message: "Sem permissão para este usuário." });
  }

  if (req.method === "PUT") {
    const {
      name,
      role,
      password,
    }: { name?: string; role?: Role; password?: string } = req.body ?? {};

    // Controle de role
    if (role && role === "SUPERADMIN" && !isSuper) {
      return res
        .status(403)
        .json({
          ok: false,
          message: "Apenas SUPERADMIN pode definir SUPERADMIN.",
        });
    }

    const data: any = {};
    if (typeof name === "string") data.name = name.trim() || null;
    if (role) data.role = role;

    // Se atualizar senha (se quiser permitir aqui)
    if (typeof password === "string" && password.length >= 6) {
      data.password = await bcrypt.hash(password, 10);
    }

    // Se virar SUPERADMIN e o ator é SUPER agregado, zera o tenantId (global)
    if (role === "SUPERADMIN" && isAggregated) {
      data.tenantId = null;
    }

    const u = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    return res.json({ ok: true, data: u });
  }

  if (req.method === "DELETE") {
    // Evita deletar a si mesmo
    if (id === sUser.id) {
      return res
        .status(400)
        .json({ ok: false, message: "Você não pode excluir a si mesmo." });
    }

    await prisma.user.delete({ where: { id } });
    return res.status(204).end();
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
}
