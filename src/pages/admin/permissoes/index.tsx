// pages/admin/permissoes/index.tsx
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Layout from "@/components/layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import { usePermissions } from "../../../hooks/usePermissions";
import {
  ensurePermissions,
  hasPermission,
  type PermissionAction,
  type PermissionModule,
  type Role,
} from "../../../utils/permissions"; // caminho conforme projeto
import {
  Shield,
  Users,
  Search,
  Save,
  X,
  CheckCircle,
  AlertTriangle,
  Building2,
} from "lucide-react";
import styles from "./styles.module.scss";

type TenantRes =
  | { ok: true; data: { id: string; name: string } | null }
  | { ok: false; message: string };

type PermissionMatrix = Record<string, Record<string, boolean>>;

interface User {
  id: string;
  name: string | null;
  email: string;
  role: "USER" | "ADMIN" | "SUPERADMIN";
  tenantId: string | null;
  tenant?: { name: string } | null;
  permissoes: PermissionMatrix | null;
}

// API pode retornar Array ou {ok,data}
type UsersRes =
  | User[]
  | { ok: true; data: User[] }
  | { ok: false; message: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!kb.includes(k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

/** -----------------------------------------------------------------------
 *  CATÁLOGO DE MÓDULOS → AÇÕES (apenas as que fazem sentido por tela)
 *  As keys devem bater com as que você usa em hasPermission() nas páginas.
 *  --------------------------------------------------------------------- */
const CATALOG: Array<{
  group: string;
  modules: Array<{
    key: PermissionModule;
    label: string;
    actions: Array<{ key: PermissionAction; label: string }>;
  }>;
}> = [
  {
    group: "Visão geral",
    modules: [
      {
        key: "dashboard",
        label: "Dashboard",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "exportPdf", label: "Exportar PDF" },
        ],
      },
      {
        key: "painel_maquinas",
        label: "Painel • Máquinas",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "edit_paradas", label: "Editar" },
        ],
      },
    ],
  },
  {
    group: "Operação & Paradas",
    modules: [
      {
        key: "operacao",
        label: "Operação",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "start_parada", label: "Iniciar" },
          { key: "finish_parada", label: "Finalizar" },
        ],
      },
      {
        key: "paradas",
        label: "Paradas",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "create", label: "Cadastrar" },
          { key: "edit", label: "Editar" },
          { key: "whatsapp_send", label: "WhatsApp" },
        ],
      },
    ],
  },
  {
    group: "Cadastros",
    modules: [
      {
        key: "maquinas",
        label: "Máquinas",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "add", label: "Adicionar" },
          { key: "edit", label: "Editar" },
          { key: "delete", label: "Excluir" },
        ],
      },
      {
        key: "secoes",
        label: "Seções",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "add", label: "Adicionar" },
          { key: "edit", label: "Editar" },
          { key: "delete", label: "Excluir" },
        ],
      },
      {
        key: "contatos",
        label: "Contatos",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "add", label: "Adicionar" },
          { key: "edit", label: "Editar" },
          { key: "delete", label: "Excluir" },
        ],
      },
      {
        key: "usuarios",
        label: "Usuários",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "add", label: "Adicionar" },
          { key: "edit", label: "Editar" },
          { key: "delete", label: "Excluir" },
        ],
      },
    ],
  },
  {
    group: "Relatórios",
    modules: [
      {
        key: "relatorios_paradas",
        label: "Relatórios • Paradas",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "exportPdf", label: "Exportar PDF" },
        ],
      },
    ],
  },
  {
    group: "Integrações",
    modules: [
      {
        key: "integracoes_whatsapp",
        label: "WhatsApp",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "open_whatsapp", label: "WhatsApp" },
          { key: "copy_link", label: "Copiar link" },
        ],
      },
    ],
  },
  {
    group: "Administração",
    modules: [
      {
        key: "clientes",
        label: "Clientes (Fábricas)",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "add", label: "Cadastrar" },
          { key: "edit", label: "Editar" },
          { key: "delete", label: "Excluir" },
        ],
      },
    ],
  },
  {
    group: "Configurações",
    modules: [
      {
        key: "settings",
        label: "Configurações",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "save", label: "Salvar" },
        ],
      },
      {
        key: "permissoes",
        label: "Permissões (esta tela)",
        actions: [
          { key: "view", label: "Visualizar" },
          { key: "save", label: "Salvar" },
        ],
      },
    ],
  },
];

export default function PermissoesAdmin() {
  const { isSuperAdmin } = usePermissions();

  // Sessão (para validar permissão VIEW/SAVE deste módulo)
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "permissoes", a);
  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canSave = useMemo(() => can("save"), [sess, myRole]);

  // Tenant atual
  const { data: tRes } = useSWR<TenantRes>("/api/tenant/current", fetcher, {
    revalidateOnFocus: false,
  });
  const tenantId =
    tRes && "ok" in tRes && tRes.ok ? tRes.data?.id ?? null : null;
  const tenantName =
    tRes && "ok" in tRes && tRes.ok
      ? tRes.data?.name ?? "LHPSYSTEMS"
      : "LHPSYSTEMS";

  // Usuários
  const { data: usersRes, isLoading } = useSWR<UsersRes>(
    "/api/admin/users",
    fetcher,
    { revalidateOnFocus: false }
  );
  const allUsers: User[] = useMemo(() => {
    if (Array.isArray(usersRes)) return usersRes;
    if (usersRes && "ok" in usersRes) return usersRes.ok ? usersRes.data : [];
    return [];
  }, [usersRes]);

  const scopedUsers = useMemo(() => {
    if (isSuperAdmin)
      return tenantId
        ? allUsers.filter((u) => u.tenantId === tenantId)
        : allUsers;
    return tenantId ? allUsers.filter((u) => u.tenantId === tenantId) : [];
  }, [allUsers, isSuperAdmin, tenantId]);

  // Busca
  const [term, setTerm] = useState("");
  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return scopedUsers;
    return scopedUsers.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s)
    );
  }, [scopedUsers, term]);

  // Seleção + matriz
  const [selected, setSelected] = useState<User | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix>({});

  const baseMatrix = useMemo(
    () => ensurePermissions(selected?.permissoes || {}),
    [selected?.permissoes]
  );
  const dirty = useMemo(
    () => !deepEqual(matrix, baseMatrix),
    [matrix, baseMatrix]
  );

  // Se o usuário selecionado sair do escopo (mudou tenant/lista), limpa seleção
  useEffect(() => {
    if (!selected) return;
    if (!scopedUsers.find((u) => u.id === selected.id)) {
      setSelected(null);
      setMatrix({});
    }
  }, [scopedUsers, selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setMatrix(ensurePermissions(selected.permissoes || {}));
  }, [selected]);

  function selectUser(u: User) {
    setSelected(u);
    setMatrix(ensurePermissions(u.permissoes || {}));
  }

  // Helpers de leitura/escrita
  const isChecked = (m: PermissionModule, a: PermissionAction) =>
    !!matrix?.[m]?.[a];

  const setAction = (
    m: PermissionModule,
    a: PermissionAction,
    val: boolean
  ) => {
    if (!canSave) return;
    setMatrix((prev) => ({
      ...prev,
      [m]: { ...(prev[m] || {}), [a]: val },
    }));
  };

  const moduleAllChecked = (m: PermissionModule, actions: PermissionAction[]) =>
    actions.every((a) => !!matrix?.[m]?.[a]);

  const toggleModuleAll = (
    m: PermissionModule,
    actions: PermissionAction[],
    val: boolean
  ) => {
    if (!canSave) return;
    setMatrix((prev) => {
      const next = { ...(prev || {}) };
      next[m] = next[m] || {};
      actions.forEach((a) => (next[m][a] = val));
      return next;
    });
  };

  // Toast
  const [toast, setToast] = useState<
    { type: "ok"; msg: string } | { type: "err"; msg: string } | null
  >(null);

  async function save() {
    if (!selected || !dirty || !canSave) return;
    try {
      const res = await fetch(`/api/admin/users/${selected.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissoes: matrix }),
      });
      if (!res.ok) throw new Error();
      setToast({
        type: "ok",
        msg: `Permissões salvas para ${selected.name ?? selected.email}.`,
      });
    } catch {
      setToast({ type: "err", msg: "Falha ao salvar. Tente novamente." });
    }
  }

  // Bloqueio por falta de VIEW (sem violar regras de hooks)
  const blockView = !!sess && !canView;

  return (
    <ProtectedRoute
      requireSuperAdmin={isSuperAdmin}
      requireClientAdmin={!isSuperAdmin}
    >
      <Layout requireAuth={true}>
        <div className={styles.page}>
          <div className={styles.topbar}>
            <div className={styles.left}>
              <div className={styles.iconWrap}>
                <Shield size={20} />
              </div>
              <div className={styles.titleWrap}>
                <h1>Permissões</h1>
                <span className={styles.subtitle}>
                  Defina por módulo e por ação
                </span>
                {!canSave && (
                  <span
                    className={styles.readonlyBadge}
                    title="Somente leitura"
                  >
                    Somente leitura
                  </span>
                )}
              </div>
            </div>
            <div className={styles.right}>
              <div className={styles.tenantBadge} title="Cliente/Fábrica atual">
                <Building2 size={14} />
                <span>{tenantName}</span>
              </div>
            </div>
          </div>

          {blockView && (
            <div className={`${styles.block} card`} role="alert">
              <strong>Sem acesso à tela de Permissões.</strong>
              <div className={styles.dimSmall}>
                Solicite a permissão de visualização.
              </div>
            </div>
          )}

          {!blockView && (
            <>
              {toast && (
                <div
                  className={`${styles.toast} ${
                    toast.type === "ok" ? styles.toastOk : styles.toastErr
                  }`}
                  role="status"
                >
                  {toast.type === "ok" ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  <span>{toast.msg}</span>
                  <button
                    className={styles.toastClose}
                    onClick={() => setToast(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className={styles.grid}>
                {/* Coluna: usuários */}
                <section className={`card ${styles.usersCard}`}>
                  <header className={styles.cardHead}>
                    <h3>
                      <Users size={16} /> Usuários
                    </h3>
                    <div className={styles.searchBox}>
                      <Search size={16} />
                      <input
                        className={styles.searchInput}
                        placeholder="Buscar por nome ou email…"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                      />
                    </div>
                  </header>

                  <div className={styles.usersList}>
                    {isLoading ? (
                      <div className={styles.centerMuted}>Carregando…</div>
                    ) : filtered.length === 0 ? (
                      <div className={styles.centerMuted}>
                        Nenhum usuário encontrado
                      </div>
                    ) : (
                      filtered.map((u) => {
                        const active = selected?.id === u.id;
                        return (
                          <button
                            key={u.id}
                            className={`${styles.userItem} ${
                              active ? styles.active : ""
                            }`}
                            onClick={() => selectUser(u)}
                            title={u.email}
                          >
                            <div className={styles.avatar}>
                              <Users size={16} />
                            </div>
                            <div className={styles.userText}>
                              <strong>{u.name || "Sem nome"}</strong>
                              <span className={styles.dim}>{u.email}</span>
                              {u.tenant?.name && (
                                <span className={styles.dimSmall}>
                                  {u.tenant.name}
                                </span>
                              )}
                            </div>
                            <span
                              className={`${styles.role} ${
                                u.role === "SUPERADMIN"
                                  ? styles.tagSuper
                                  : u.role === "ADMIN"
                                  ? styles.tagAdmin
                                  : styles.tagUser
                              }`}
                            >
                              {u.role}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Coluna: cartões por módulo */}
                <section className={`card ${styles.modulesPanel}`}>
                  {!selected ? (
                    <div className={styles.centerMutedBig}>
                      <Shield size={28} />
                      <div>Selecione um usuário para editar as permissões</div>
                    </div>
                  ) : (
                    <>
                      <header className={styles.selHead}>
                        <div className={styles.selUserWrap}>
                          <div className={styles.avatarLg}>
                            <Users size={18} />
                          </div>
                          <div>
                            <h3>{selected.name || selected.email}</h3>
                            <div className={styles.dim}>{selected.email}</div>
                          </div>
                        </div>

                        <button
                          className={styles.saveBtn}
                          disabled={!dirty || !canSave}
                          onClick={save}
                          title={
                            !canSave
                              ? "Sem permissão para salvar"
                              : dirty
                              ? "Salvar alterações"
                              : "Nada para salvar"
                          }
                        >
                          <Save size={16} />
                          Salvar
                        </button>
                      </header>

                      {/* Grupos + cartões de módulos */}
                      <div className={styles.groupsWrap}>
                        {CATALOG.map((g) => (
                          <div key={g.group} className={styles.groupBlock}>
                            <div className={styles.groupTitle}>{g.group}</div>
                            <div className={styles.moduleGrid}>
                              {g.modules.map((m) => {
                                const actionKeys = m.actions.map((a) => a.key);
                                const allOn = moduleAllChecked(
                                  m.key,
                                  actionKeys
                                );
                                return (
                                  <div
                                    key={m.key}
                                    className={styles.moduleCard}
                                    data-mod={m.key} // <- para temas coloridos por módulo
                                  >
                                    <div className={styles.moduleHead}>
                                      <div className={styles.moduleTitle}>
                                        {m.label}
                                      </div>
                                      <label className={styles.toggleAll}>
                                        <input
                                          type="checkbox"
                                          checked={allOn}
                                          onChange={(e) =>
                                            toggleModuleAll(
                                              m.key,
                                              actionKeys,
                                              e.target.checked
                                            )
                                          }
                                          disabled={!canSave}
                                        />
                                        <span>Selecionar tudo</span>
                                      </label>
                                    </div>

                                    <div className={styles.chips}>
                                      {m.actions.map((a) => (
                                        <label
                                          key={a.key}
                                          className={styles.chip}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={isChecked(m.key, a.key)}
                                            onChange={(e) =>
                                              setAction(
                                                m.key,
                                                a.key,
                                                e.target.checked
                                              )
                                            }
                                            disabled={!canSave}
                                          />
                                          <span>{a.label}</span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </Layout>
    </ProtectedRoute>
  );
}
