// src/components/ProtectedRoute.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

type Props = {
  children: React.ReactNode;
  requireSuperAdmin?: boolean; // exige SUPERADMIN
  requireClientAdmin?: boolean; // exige ADMIN ou SUPERADMIN
};

export default function ProtectedRoute({
  children,
  requireSuperAdmin,
  requireClientAdmin,
}: Props) {
  const router = useRouter();
  const { status, data } = useSession(); // "loading" | "authenticated" | "unauthenticated"
  const role = (data?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;

  // regra de acesso por role (sem ACL fina ainda)
  const hasAccess =
    (!requireSuperAdmin && !requireClientAdmin) ||
    (requireSuperAdmin && role === "SUPERADMIN") ||
    (requireClientAdmin && (role === "ADMIN" || role === "SUPERADMIN"));

  // se não autenticado, manda para a página de login configurada no NextAuth
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login"); // ajuste aqui se sua rota de login for /auth/login
    }
  }, [status, router]);

  if (status === "loading") return null; // pode colocar um spinner aqui
  if (!hasAccess) return <div style={{ padding: 24 }}>Acesso negado.</div>;

  return <>{children}</>;
}
