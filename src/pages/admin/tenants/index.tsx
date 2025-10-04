import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { Search, Building2, Eye } from "lucide-react";

type Tenant = { id: string; name: string; logoBase64?: string | null };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function setCookie(name: string, value: string, maxAgeSec = 60 * 60 * 24) {
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export default function TenantsAdminPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const role =
    ((session?.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN") || "USER";

  const { data, error, isLoading } = useSWR<{ ok: boolean; data: Tenant[] }>(
    role === "SUPERADMIN" ? "/api/admin/tenants" : null,
    fetcher
  );

  // se não for superadmin, manda pro dashboard
  useEffect(() => {
    if (role && role !== "SUPERADMIN") {
      router.replace("/dashboard");
    }
  }, [role, router]);

  function selecionarTenant(id: string) {
    // Mantém adminMode=1 (continua superadmin), mas filtra pelo selectedTenantId
    setCookie("adminMode", "1");
    setCookie("selectedTenantId", id);
    router.push("/dashboard");
  }

  function verTodosAgregado() {
    setCookie("adminMode", "1");
    clearCookie("selectedTenantId"); // agregado de todos os tenants
    router.push("/dashboard");
  }

  // busca local
  const [q, setQ] = useState("");
  const tenants = data?.data ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = term
      ? (tenants ?? []).filter((t) =>
          (t.name || "").toLowerCase().includes(term)
        )
      : tenants ?? [];

    return [...base].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "pt-BR", {
        sensitivity: "base",
      })
    );
  }, [tenants, q]);
  return (
    <Layout requireAuth={true}>
      <div className={styles.container}>
        {/* HERO / CABEÇALHO */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.logoSection}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/imagens/logo2.png"
                alt="Logo"
                className={styles.logo}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "/imagens/escudo.png";
                }}
              />
              <div className={styles.headerText}>
                <h1>Selecionar Cliente</h1>
                <p>Visualize e altere o cliente (apenas SUPERADMIN)</p>
              </div>
            </div>

            <button
              className={styles.superAdminButton}
              onClick={verTodosAgregado}
            >
              Ver TODOS (agregado)
            </button>
          </div>
        </div>

        {/* BUSCA */}
        <div className={styles.main}>
          <div className={styles.searchSection}>
            <div className={styles.searchContainer}>
              <Search size={18} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Pesquisar clientes…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {/* LISTAGEM */}
          {isLoading ? (
            <div className={styles.loadingClients}>
              <div className={styles.spinner} />
              <p>Carregando clientes…</p>
            </div>
          ) : error ? (
            <div className={styles.emptyState}>
              <Building2 size={48} />
              <h3>Falha ao carregar</h3>
              <p>Tente novamente mais tarde.</p>
            </div>
          ) : filtered.length > 0 ? (
            <div className={styles.clientsGrid}>
              {filtered.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={styles.clientCard}
                  onClick={() => selecionarTenant(t.id)}
                  title={`Entrar em ${t.name}`}
                >
                  <div className={styles.clientHeader}>
                    <div className={styles.clientLogo}>
                      {t.logoBase64 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoBase64} alt={t.name} />
                      ) : (
                        <div className={styles.logoFallback}>
                          {t.name.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <h3>{t.name}</h3>
                  </div>

                  <div className={styles.clientAction}>
                    <Eye size={16} />
                    <span>Entrar neste cliente</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <Building2 size={48} />
              <h3>Nenhum cliente encontrado</h3>
              <p>Cadastre um cliente ou ajuste sua pesquisa.</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
