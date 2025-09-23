import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import Layout from "@/components/layout";
import styles from "./public.module.scss";
import { Search, Building2, Users, Eye } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type PublicCliente = {
  id: string;
  name: string;
  slug?: string;
  logo?: string;
  description?: string;
  _count?: { users?: number; grupos?: number };
};

export default function HomePublic() {
  const { data, isLoading } = useSWR<{ data: PublicCliente[] }>(
    "/api/public/clientes",
    fetcher
  );

  const [q, setQ] = useState("");
  const clientes = data?.data ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return clientes;
    return clientes.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.description || "").toLowerCase().includes(term)
    );
  }, [clientes, q]);

  return (
    <Layout requireAuth={false}>
      <div className={styles.main}>
        <div className={styles.welcomeSection}>
          <h2>Selecione um Cliente</h2>
          <p>
            Escolha a fábrica/cliente para acessar, ou entre como Super Admin.
          </p>
        </div>

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

        {isLoading ? (
          <div className={styles.loadingClients}>
            <div className={styles.spinner} />
            <p>Carregando clientes…</p>
          </div>
        ) : filtered.length > 0 ? (
          <div className={styles.clientsGrid}>
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={{ pathname: "/login", query: { clientId: c.id } }}
                className={styles.clientCard}
              >
                <div className={styles.clientHeader}>
                  <div className={styles.clientLogo}>
                    {c.logo ? <img src={c.logo} alt={c.name} /> : <Building2 />}
                  </div>
                  <h3>{c.name}</h3>
                </div>

                <div className={styles.clientDescription}>
                  <p>{c.description || "Cliente sem descrição"}</p>
                </div>

                {(c._count?.users || c._count?.grupos) && (
                  <div className={styles.clientStats}>
                    {typeof c._count?.users === "number" && (
                      <div className={styles.stat}>
                        <Users size={16} />
                        <span>{c._count.users} usuários</span>
                      </div>
                    )}
                    {typeof c._count?.grupos === "number" && (
                      <div className={styles.stat}>
                        <Building2 size={16} />
                        <span>{c._count.grupos} grupos</span>
                      </div>
                    )}
                  </div>
                )}

                <div className={styles.clientAction}>
                  <Eye size={16} />
                  <span>Entrar / Ver</span>
                </div>
              </Link>
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
    </Layout>
  );
}
