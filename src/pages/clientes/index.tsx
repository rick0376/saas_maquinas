// pages/clientes/index.tsx
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  LogIn,
  LayoutDashboard,
  Users,
  Shield,
  Search,
} from "lucide-react";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

type Cliente = { id: string; name: string; createdAt?: string };
type Payload = {
  data: Cliente[];
  currentTenantId?: string;
  role?: Role;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ClientesPage() {
  const router = useRouter();

  // Sessão para permissões
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "clientes", a);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canAdd = useMemo(() => can("add"), [sess, myRole]);
  const canEdit = useMemo(() => can("edit"), [sess, myRole]);
  const canDelete = useMemo(() => can("delete"), [sess, myRole]);

  // Se não pode visualizar, bloqueia a página
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <strong>Sem acesso à página de Clientes.</strong>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Solicite ao administrador a permissão de visualização.
          </div>
        </div>
      </Layout>
    );
  }

  const { data, isLoading } = useSWR<Payload>("/api/clientes", fetcher, {
    revalidateOnFocus: false,
  });

  const clientes = data?.data ?? [];
  const atual = data?.currentTenantId ?? "";
  const role: Role = (data?.role as Role) ?? "USER";
  const isSuper = role === "SUPERADMIN";

  // busca local
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clientes;
    return clientes.filter((c) => c.name.toLowerCase().includes(s));
  }, [clientes, q]);

  // criação/edição
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const isEditing = (id: string) => edit?.id === id;

  // exclusão
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(
    null
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!(isSuper && canAdd)) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const res = await fetch("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (res.ok) {
      setName("");
      await mutate("/api/clientes");
      router.push("/dashboard");
    }
  }

  async function onSwitch(id: string) {
    // switch de cliente continua sendo ação exclusiva de SUPERADMIN
    if (!isSuper) return;
    const res = await fetch("/api/clientes/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      await mutate("/api/clientes");
      router.push("/dashboard");
    }
  }

  async function onSaveEdit() {
    if (!(isSuper && canEdit) || !edit) return;
    const trimmed = edit.name.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/clientes/${edit.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (res.ok) {
      setEdit(null);
      mutate("/api/clientes");
    }
  }

  async function onDelete(id: string) {
    if (!(isSuper && canDelete)) return;
    const res = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    setConfirm(null);
    if (res.ok) mutate("/api/clientes");
  }

  // Se não for superadmin, mostra só o cliente atual de forma read-only
  const onlyCurrentForNonSuper =
    !isSuper && atual ? clientes.filter((c) => c.id === atual) : list;

  return (
    <Layout requireAuth={true}>
      <div className={styles.container}>
        <div className={styles.topbar}>
          <div className={styles.titleWrap}>
            <Building2 size={18} />
            <h1>Clientes (Fábricas)</h1>
          </div>

          <div className={styles.roleWrap}>
            <span
              className={`${styles.roleBadge} ${
                isSuper ? styles.roleSuper : styles.roleUser
              }`}
              title={`Perfil: ${role}`}
            >
              <Shield size={12} />
              {role}
            </span>
            <span className={styles.hint}>
              {isSuper
                ? "Gerencie e selecione o cliente ativo."
                : "Você não é superadmin. Exibindo apenas o cliente atual."}
            </span>
          </div>
        </div>

        {/* Barra de busca + criação (apenas se SUPERADMIN + permissão add) */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              className={styles.searchInput}
              placeholder="Buscar cliente por nome…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {isSuper && canAdd && (
            <form className={styles.inlineForm} onSubmit={onCreate}>
              <input
                className={styles.inputNovo}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Novo cliente (Ex.: Fábrica XPTO)"
                required
              />
              <button className={styles.primaryBtn} type="submit" title="Criar">
                <Plus size={16} />
                Cadastrar e usar
              </button>
            </form>
          )}
        </div>

        {/* Lista/cards */}
        {isLoading ? (
          <section className={`card ${styles.loadingCard}`}>
            <div className={styles.spinner} />
            <span>Carregando clientes…</span>
          </section>
        ) : (
          <div className={styles.grid}>
            {onlyCurrentForNonSuper.map((c) => {
              const ativo = c.id === atual;
              const allowEdit = isSuper && canEdit;
              const allowDelete = isSuper && canDelete;

              return (
                <div
                  key={c.id}
                  className={`${styles.card} ${ativo ? styles.active : ""}`}
                >
                  <header className={styles.cardHeader}>
                    {!isEditing(c.id) ? (
                      <h3 className={styles.cardTitle}>{c.name}</h3>
                    ) : (
                      <input
                        className={styles.input}
                        value={edit!.name}
                        onChange={(e) =>
                          setEdit({ id: c.id, name: e.target.value })
                        }
                      />
                    )}

                    <div className={styles.badges}>
                      {ativo && <span className={styles.badge}>ATUAL</span>}
                      {isSuper && (
                        <span className={styles.badgeNeutral}>
                          <Shield size={12} />
                          Superadmin
                        </span>
                      )}
                    </div>
                  </header>

                  <div className={styles.cardActions}>
                    {isSuper ? (
                      !ativo ? (
                        <button
                          className={styles.primaryBtn}
                          onClick={() => onSwitch(c.id)}
                          title="Tornar cliente atual"
                        >
                          <LogIn size={16} />
                          Usar este cliente
                        </button>
                      ) : (
                        <>
                          <button
                            className={styles.softBtn}
                            onClick={() => router.push("/dashboard")}
                          >
                            <LayoutDashboard size={16} />
                            Dashboard
                          </button>
                          <button
                            className={styles.softBtn}
                            onClick={() => router.push("/contatos")}
                          >
                            <Users size={16} />
                            Contatos
                          </button>
                          <button
                            className={styles.softBtn}
                            onClick={() => router.push("/usuarios")}
                          >
                            <Users size={16} />
                            Usuários
                          </button>
                        </>
                      )
                    ) : ativo ? (
                      <>
                        <button
                          className={styles.softBtn}
                          onClick={() => router.push("/dashboard")}
                        >
                          <LayoutDashboard size={16} />
                          Dashboard
                        </button>
                        <button
                          className={styles.softBtn}
                          onClick={() => router.push("/contatos")}
                        >
                          <Users size={16} />
                          Contatos
                        </button>
                      </>
                    ) : (
                      <span className={styles.dimSmall}>
                        Selecione o cliente atual com um superadmin.
                      </span>
                    )}
                  </div>

                  <div className={styles.cardActions}>
                    {!isEditing(c.id) ? (
                      <button
                        className={styles.ghostBtn}
                        onClick={() =>
                          allowEdit && setEdit({ id: c.id, name: c.name })
                        }
                        disabled={!allowEdit}
                        title={
                          allowEdit
                            ? "Editar nome"
                            : "Somente superadmin com permissão"
                        }
                      >
                        <Pencil size={16} />
                        Editar
                      </button>
                    ) : (
                      <>
                        <button
                          className={styles.primaryBtn}
                          onClick={onSaveEdit}
                          disabled={!allowEdit}
                          title={
                            allowEdit ? "Salvar alterações" : "Sem permissão"
                          }
                        >
                          <Check size={16} />
                          Salvar
                        </button>
                        <button
                          className={styles.ghostBtn}
                          onClick={() => setEdit(null)}
                        >
                          <X size={16} />
                          Cancelar
                        </button>
                      </>
                    )}

                    <button
                      className={styles.dangerBtn}
                      onClick={() =>
                        allowDelete && setConfirm({ id: c.id, name: c.name })
                      }
                      disabled={!allowDelete}
                      title={
                        allowDelete
                          ? "Excluir cliente"
                          : "Somente superadmin com permissão"
                      }
                    >
                      <Trash2 size={16} />
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}

            {onlyCurrentForNonSuper.length === 0 && (
              <section className={`card ${styles.emptyCard}`}>
                <Building2 size={28} />
                <span className={styles.emptyTitle}>
                  Nenhum cliente disponível
                </span>
                <span className={styles.emptyText}>
                  Peça para um superadmin criar ou selecionar um cliente.
                </span>
              </section>
            )}
          </div>
        )}

        {/* Modal de confirmação de exclusão */}
        {confirm && (
          <>
            <div
              className={styles.modalOverlay}
              onClick={() => setConfirm(null)}
            />
            <div className={styles.modal} role="dialog" aria-modal="true">
              <div className={styles.modalIcon}>
                <Trash2 size={20} />
              </div>
              <h4 className={styles.modalTitle}>Excluir cliente?</h4>
              <p className={styles.modalText}>
                Tem certeza que deseja excluir <strong>{confirm.name}</strong>?
                Esta ação não pode ser desfeita.
              </p>
              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setConfirm(null)}
                >
                  Cancelar
                </button>
                <button
                  className={styles.dangerBtn}
                  onClick={() => onDelete(confirm.id)}
                  disabled={!(isSuper && canDelete)}
                >
                  Excluir
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
