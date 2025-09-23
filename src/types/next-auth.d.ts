// src/types/next-auth.d.ts
import { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

type PermissoesMap = Record<string, Record<string, boolean>>;

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name?: string | null;
    tenantId: string;
    role: "USER" | "ADMIN" | "SUPERADMIN";
    permissoes?: PermissoesMap | null;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      tenantId: string;
      role: "USER" | "ADMIN" | "SUPERADMIN";
      permissoes?: PermissoesMap | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sub?: string;
    email?: string;
    name?: string | null;
    tenantId: string;
    role?: "USER" | "ADMIN" | "SUPERADMIN";
    permissoes?: PermissoesMap | null;
  }
}
