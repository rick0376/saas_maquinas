import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Tipinho local para satisfazer o NextAuth (não afeta o resto do projeto)
type PermissoesMap = Record<string, Record<string, boolean>>;

function readCookie(req: any, name: string): string | null {
  const raw = req?.headers?.cookie || "";
  const match = raw
    .split(";")
    .map((s: string) => s.trim())
    .find((s: string) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      // ⬇️ incluímos tenantId aqui
      credentials: { email: {}, password: {}, tenantId: {} },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const adminMode = readCookie(req, "adminMode") === "1";
        const selectedTenantIdCookie = readCookie(req, "selectedTenantId");

        // tenantId que o front declarou estar tentando acessar (quando não for admin)
        const claimedTenantId =
          (credentials.tenantId as string | undefined)?.trim() || null;

        // busca usuário com role + permissoes
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            tenantId: true,
            role: true,
            permissoes: true, // Prisma.JsonValue
          },
        });
        if (!user || !user.password) return null;

        // valida senha
        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) return null;

        // superadmin só entra se realmente for SUPERADMIN
        if (adminMode) {
          if (user.role !== "SUPERADMIN") return null;
        } else {
          // modo cliente:
          // prioridade: tenantId enviado no signIn > cookie (fallback)
          const effectiveClaim =
            claimedTenantId || selectedTenantIdCookie || null;

          // se for informado algum tenant "alvo", precisa bater com o tenant do usuário
          if (effectiveClaim && user.tenantId !== effectiveClaim) {
            return null; // bloqueia login cruzado (ex.: user da fábrica 01 tentando logar na 04)
          }
        }

        // Cast do JSON do Prisma para o tipo esperado pelo NextAuth
        const permissoes =
          (user.permissoes as unknown as PermissoesMap) ?? null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
          permissoes,
        } as any;
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as any).id;
        token.email = (user as any).email;
        token.name = (user as any).name ?? null;
        (token as any).tenantId = (user as any).tenantId;
        (token as any).role = (user as any).role;
        (token as any).permissoes = (user as any).permissoes ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.email = token.email as string;
        session.user.name = (token.name as string) ?? session.user.name;
        (session.user as any).tenantId = (token as any).tenantId as string;
        (session.user as any).role = (token as any).role as string;
        (session.user as any).permissoes = (token as any).permissoes ?? null;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
