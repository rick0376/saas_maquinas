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

  if (req.method === "GET") {
    // SUPER agregado => lista todos
    // SUPER com cliente selecionado => lista só daquele cliente
    // USER/ADMIN => só do próprio tenant
    const where = isSuper
      ? selectedTenantId
        ? { tenantId: selectedTenantId }
        : {}
      : { tenantId: myTenantId };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        tenantId: true,
      },
      orderBy: [{ tenantId: "asc" }, { name: "asc" }, { email: "asc" }],
    });

    return res.json({ ok: true, data: users });
  }

  if (req.method === "POST") {
    const {
      email,
      name,
      password,
      role,
    }: { email?: string; name?: string; password?: string; role?: Role } =
      req.body ?? {};

    if (!email || !role) {
      return res
        .status(400)
        .json({ ok: false, message: "Email e role são obrigatórios." });
    }
    const emailNorm = String(email).trim().toLowerCase();

    if (!password || password.length < 6) {
      return res
        .status(400)
        .json({ ok: false, message: "Senha inválida (mín. 6 caracteres)." });
    }

    // Regras de quem pode criar o quê
    if (!isSuper && role === "SUPERADMIN") {
      return res
        .status(403)
        .json({
          ok: false,
          message: "Apenas SUPERADMIN pode criar SUPERADMIN.",
        });
    }

    // Decide tenant do novo usuário
    let tenantIdToUse: string | null = null;

    if (role === "SUPERADMIN") {
      // SUPER agregado => global (tenantId null)
      // SUPER “dentro de cliente” => vincula ao cliente atual
      tenantIdToUse = isAggregated
        ? null
        : selectedTenantId || myTenantId || null;
    } else {
      // USER/ADMIN sempre precisam de tenant
      if (isSuper) {
        if (!selectedTenantId) {
          return res
            .status(400)
            .json({
              ok: false,
              message: "Selecione um cliente para criar USER/ADMIN.",
            });
        }
        tenantIdToUse = selectedTenantId;
      } else {
        if (!myTenantId) {
          return res
            .status(400)
            .json({ ok: false, message: "Tenant não encontrado." });
        }
        tenantIdToUse = myTenantId;
      }
    }

    // Não permitir duplicar email
    const exists = await prisma.user.findUnique({
      where: { email: emailNorm },
    });
    if (exists) {
      return res
        .status(409)
        .json({ ok: false, message: "Email já cadastrado." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const u = await prisma.user.create({
      data: {
        email: emailNorm,
        name: name?.trim() || null,
        role,
        password: passwordHash, // seu schema usa "password" (hash)
        tenantId: tenantIdToUse, // pode ser null para superadmin global
      },
      select: { id: true, email: true, name: true, role: true, tenantId: true },
    });

    return res.status(201).json({ ok: true, data: u });
  }

  return res.status(405).json({ ok: false, message: "Method not allowed" });
}
