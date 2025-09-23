import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";

// Lista nomes e ids de todos os Tenants (público)
export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    res.json({ data: tenants });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao carregar clientes" });
  }
}
