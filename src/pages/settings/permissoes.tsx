import Layout from "@/components/layout";
import styles from "./permissoes.module.scss";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Shield } from "lucide-react";

type Role = "USER" | "ADMIN" | "SUPERADMIN";
type Usuario = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function PermissoesPage() {
  const { data: session } = useSession();
  const myRole = (session as any)?.user?.role as Role;

  const { data, mutate, isLoading } = useSWR<{ data: Usuario[] }>(
    "/api/usuarios",
    fetcher,
    { revalidateOnFocus: false }
  );

  const usuarios = data?.data ?? [];
  const [q, setQ] = useState("");

  // ===== filtro por nome/email =====
  const filtered = useMemo(() => {
    if (!q.trim()) return usuarios;
    const s = q.toLowerCase();
    return usuarios.filter(
      (u) =>
        u.email.toLowerCase().includes(s) ||
        (u.name || "").toLowerCase().includes(s)
    );
  }, [q, usuarios]);

  const canEdit = myRole === "ADMIN" || myRole === "SUPERADMIN";

  // ===== MODAL de confirmação =====
  const [pending, setPending] = useState<{
    id: string;
    newRole: Role;
    userName: string;
    userEmail: string;
  } | null>(null);

  async function doChangeRole() {
    if (!pending) return;
    const { id, newRole } = pending;
    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar perfil.");
      setPending(null);
      await mutate();
    } catch (e: any) {
      alert(e?.message || "Erro ao atualizar perfil.");
    }
  }

  // Bloqueia acesso se não for ADMIN+
  if (!canEdit) {
    return (
      <Layout requireAuth={true}>
        <div className={`card ${styles.blockCard}`}>
          <h2>Acesso restrito</h2>
          <p>
            Somente usuários com perfil <strong>ADMIN</strong> ou{" "}
            <strong>SUPERADMIN</strong> podem gerenciar permissões.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Permissões</h1>
        <span className={styles.hint}>
          Defina o perfil de acesso dos usuários.
        </span>
      </div>

      <div className={`card ${styles.form}`}>
        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label}>Buscar</label>
            <input
              className={styles.input}
              placeholder="Nome ou e-mail…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th style={{ width: 260 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Carregando…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.empty}>
                    Nenhum usuário.
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name || "—"}</td>
                    <td>{u.email}</td>
                    <td>
                      <span
                        className={
                          u.role === "SUPERADMIN"
                            ? styles.roleSuper
                            : u.role === "ADMIN"
                            ? styles.roleAdmin
                            : styles.roleUser
                        }
                      >
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className={styles.smallBtn}
                          onClick={() =>
                            setPending({
                              id: u.id,
                              newRole: "USER",
                              userName: u.name || "—",
                              userEmail: u.email,
                            })
                          }
                          disabled={u.role === "USER"}
                          title="Tornar USER"
                        >
                          USER
                        </button>
                        <button
                          className={styles.smallBtn}
                          onClick={() =>
                            setPending({
                              id: u.id,
                              newRole: "ADMIN",
                              userName: u.name || "—",
                              userEmail: u.email,
                            })
                          }
                          disabled={u.role === "ADMIN"}
                          title="Tornar ADMIN"
                        >
                          ADMIN
                        </button>
                        {myRole === "SUPERADMIN" && (
                          <button
                            className={styles.smallBtn}
                            onClick={() =>
                              setPending({
                                id: u.id,
                                newRole: "SUPERADMIN",
                                userName: u.name || "—",
                                userEmail: u.email,
                              })
                            }
                            disabled={u.role === "SUPERADMIN"}
                            title="Tornar SUPERADMIN"
                          >
                            SUPERADMIN
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Modal de confirmação ===== */}
      {pending && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setPending(null)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={styles.modalIcon}>
              <Shield />
            </div>
            <h4 className={styles.modalTitle}>
              Confirmar alteração de perfil?
            </h4>
            <p className={styles.modalText}>
              Usuário: <strong>{pending.userName}</strong>
              <br />
              E-mail: <strong>{pending.userEmail}</strong>
              <br />
              Novo perfil: <strong>{pending.newRole}</strong>
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.ghostBtn}
                onClick={() => setPending(null)}
              >
                Cancelar
              </button>
              <button className={styles.primaryBtn} onClick={doChangeRole}>
                Confirmar
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
