import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

/**
 * Retorna { userId, tenantId, role } ou responde 401 e retorna null.
 * 1) Tenta sessão (getServerSession) -> mais estável
 * 2) Fallback para JWT (getToken)
 */
export async function requireAuth(req: NextApiRequest, res: NextApiResponse) {
  // 1) Sessão do NextAuth
  const session = await getServerSession(req, res, authOptions);
  if (session?.user) {
    const u = session.user as any;
    // Campos que seu callback de session já preenche: id, tenantId, role
    return {
      userId: u.id as string,
      tenantId: u.tenantId as string,
      role: u.role as string,
    };
  }

  // 2) Fallback: JWT diretamente do cookie
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    res.status(401).json({
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "Faça login." },
    });
    return null;
  }

  // No JWT, o id do usuário vem em token.sub (não token.id)
  const userId =
    (token.sub as string | undefined) ||
    ((token as any).id as string | undefined);

  return {
    userId: userId as string,
    tenantId: (token as any).tenantId as string,
    role: (token as any).role as string,
  };
}
