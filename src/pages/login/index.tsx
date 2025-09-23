import Layout from "@/components/layout";
import { signIn, signOut, getSession, useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useState, FormEvent } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  LogIn,
  ArrowLeft,
  Crown,
  Shield,
  Info,
  AlertTriangle,
} from "lucide-react";
import styles from "./styles.module.scss";

export default function Login() {
  const router = useRouter();
  const { admin, reason, clientId } = router.query; // ⬅️ pegamos clientId da URL quando vem de "entrar na fábrica X"
  const isSuperAdminLogin = admin === "true";
  const { status } = useSession();

  const [email, setEmail] = useState(
    process.env.NODE_ENV === "development" ? "admin@lhp.com" : ""
  );
  const [password, setPassword] = useState(
    process.env.NODE_ENV === "development" ? "123456" : ""
  );
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  // helpers cookies
  const setCookie = (name: string, value: string, maxAgeSec = 60 * 60 * 24) => {
    document.cookie = `${name}=${encodeURIComponent(
      value
    )}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
  };
  const clearCookie = (name: string) => {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  };

  // 0) Encerrar sessão antiga e limpar cookies ao abrir /login
  useEffect(() => {
    (async () => {
      if (status === "authenticated") {
        await signOut({ redirect: false });
      }
      clearCookie("adminMode");
      clearCookie("selectedTenantId");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1) Se veio de um link "Entrar como cliente X", guarda o tenant da URL
  useEffect(() => {
    const id = typeof clientId === "string" ? clientId : "";
    if (id && !isSuperAdminLogin) {
      setSelectedTenantId(id);
    } else {
      setSelectedTenantId("");
    }
  }, [clientId, isSuperAdminLogin]);

  function reasonMessage() {
    switch (reason) {
      case "session-expired":
        return {
          type: "warning" as const,
          title: "Sessão expirada",
          text: "Faça login novamente para continuar.",
        };
      case "unauthorized":
        return {
          type: "error" as const,
          title: "Acesso negado",
          text: "Você não tem permissão para esta área.",
        };
      case "permissions-updated":
        return {
          type: "info" as const,
          title: "Permissões atualizadas",
          text: "Entre novamente para carregar as novas permissões.",
        };
      default:
        return null;
    }
  }
  const reasonBox = reasonMessage();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      // 1) autentica — enviamos tenantId quando NÃO é superadmin
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        tenantId: isSuperAdminLogin ? "" : selectedTenantId, // ⬅️ chave para o authorize bloquear logins cruzados
      });

      if (!res?.ok) {
        if (res?.error === "CredentialsSignin") {
          setErr("Email, senha ou cliente inválidos.");
        } else {
          setErr("Erro ao autenticar. Tente novamente.");
        }
        return;
      }

      // 2) lê a sessão autenticada
      const s = await getSession();
      const role = (s?.user as any)?.role as
        | "USER"
        | "ADMIN"
        | "SUPERADMIN"
        | undefined;
      const sessionTenantId = (s?.user as any)?.tenantId as string | undefined;

      // 3) define cookies após login
      if (isSuperAdminLogin && role === "SUPERADMIN") {
        setCookie("adminMode", "1");
        clearCookie("selectedTenantId"); // superadmin sem cliente selecionado = agregado
      } else {
        clearCookie("adminMode");
        if (sessionTenantId) {
          // reforça o tenant da sessão
          setCookie("selectedTenantId", sessionTenantId);
        } else {
          clearCookie("selectedTenantId");
        }
      }

      // 4) redireciona
      router.push("/dashboard");
    } catch {
      setErr("Erro interno. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    router.push("/");
  }

  return (
    <Layout requireAuth={false} showNav={true}>
      <div className={styles.pageWrapper}>
        <div className={styles.loginContainer}>
          <button type="button" className={styles.backButton} onClick={goBack}>
            <ArrowLeft size={16} /> Voltar
          </button>

          {reasonBox && (
            <div className={`${styles.reason} ${styles[reasonBox.type]}`}>
              <div className={styles.reasonIcon}>
                {reasonBox.type === "info" && <Info size={18} />}
                {reasonBox.type === "warning" && <AlertTriangle size={18} />}
                {reasonBox.type === "error" && <Shield size={18} />}
              </div>
              <div className={styles.reasonContent}>
                <h4 className={styles.reasonTitle}>{reasonBox.title}</h4>
                <p className={styles.reasonText}>{reasonBox.text}</p>
              </div>
            </div>
          )}

          <div className={styles.headerBox}>
            <div className={styles.logoBox}>
              {isSuperAdminLogin ? (
                <div className={styles.superAdminLogo}>
                  <Crown size={40} />
                </div>
              ) : (
                <img
                  src={"/imagens/logo2.png"}
                  alt="Logo"
                  className={styles.logo}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              )}
            </div>

            <h1 className={styles.title}>
              {isSuperAdminLogin ? "Super Administrador" : "Acesse sua conta"}
            </h1>

            {isSuperAdminLogin && (
              <div className={styles.superAdminPill}>
                <Shield size={16} /> Acesso total ao painel administrativo
              </div>
            )}

            <p className={styles.subtitle}>
              {isSuperAdminLogin
                ? "Entre com suas credenciais de administrador"
                : "Faça login para acessar o sistema"}
            </p>
          </div>

          <form onSubmit={onSubmit} className={styles.form}>
            <div className={styles.group}>
              <label className={styles.label}>
                <Mail size={16} /> Email
              </label>
              <input
                type="email"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  isSuperAdminLogin ? "superadmin@root.local" : "seu@email.com"
                }
                required
                disabled={loading}
                name="email"
                autoComplete="username"
              />
            </div>

            <div className={styles.group}>
              <label className={styles.label}>
                <Lock size={16} /> Senha
              </label>
              <div className={styles.passwordWrap}>
                <input
                  type={showPassword ? "text" : "password"}
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    isSuperAdminLogin ? "superadmin123" : "Sua senha"
                  }
                  required
                  disabled={loading}
                  name="password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {err && <div className={styles.error}>{err}</div>}

            {isSuperAdminLogin && (
              <div className={styles.superAdminWarn}>
                <Shield size={16} /> Você está entrando como Super
                Administrador.
              </div>
            )}

            <button
              type="submit"
              className={`${styles.submit} ${loading ? styles.loading : ""} ${
                isSuperAdminLogin ? styles.superBtn : ""
              }`}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className={styles.spinner} />{" "}
                  {isSuperAdminLogin ? "Autenticando..." : "Entrando..."}
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  {isSuperAdminLogin ? "Entrar como Super Admin" : "Entrar"}
                </>
              )}
            </button>
          </form>

          <div className={styles.footerBox}>
            <p className={styles.footerText}>
              © {new Date().getFullYear()} —{" "}
              {process.env.NEXT_PUBLIC_CLIENTE_NOME || "SaaS Máquinas"}
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
