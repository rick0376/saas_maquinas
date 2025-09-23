// pages/api/clientes/switch.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  const sUser = session?.user as any;
  if (!sUser || sUser.role !== "SUPERADMIN") {
    return res.status(403).json({ ok: false, message: "Forbidden" });
  }

  const { id } = req.body as { id?: string | null };
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";

  // Sempre liga adminMode
  res.setHeader("Set-Cookie", [
    `adminMode=1; Path=/; HttpOnly; SameSite=Lax;${secure}`,
    id
      ? `selectedTenantId=${encodeURIComponent(
          id
        )}; Path=/; HttpOnly; SameSite=Lax;${secure}`
      : `selectedTenantId=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax;${secure}`, // limpa (agregado)
  ]);

  return res.json({ ok: true });
}
