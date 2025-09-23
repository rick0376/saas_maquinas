// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // ROTAS PÚBLICAS (não exigem login)
  const isPublic =
    pathname === "/" || // landing pública com lista de clientes
    pathname.startsWith("/login") || // tela de login
    pathname.startsWith("/api/auth") || // endpoints do NextAuth
    pathname.startsWith("/api/public") || // suas APIs públicas
    pathname.startsWith("/_next") || // assets do Next.js
    pathname.startsWith("/favicon"); // favicon, manifest etc.

  if (isPublic) return NextResponse.next();

  // Verifica sessão (JWT do NextAuth)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // preserva a URL de destino
    if (pathname)
      url.searchParams.set(
        "callbackUrl",
        pathname + (searchParams.toString() ? `?${searchParams}` : "")
      );
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// SOMENTE estas rotas são protegidas pelo middleware.
// (adicione aqui o que for privado; o restante continua público)
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/maquinas/:path*",
    "/secoes/:path*",
    "/paradas/:path*",
    "/contatos/:path*",
    "/usuarios/:path*",
    "/clientes/:path*", // gestão interna de clientes
    "/admin/:path*", // telas/admin

    // APIs privadas:
    "/api/dashboard/:path*",
    "/api/maquinas/:path*",
    "/api/secoes/:path*",
    "/api/paradas/:path*",
    "/api/contatos/:path*",
    "/api/usuarios/:path*",
    "/api/clientes/:path*",
    "/api/admin/:path*",
  ],
};
