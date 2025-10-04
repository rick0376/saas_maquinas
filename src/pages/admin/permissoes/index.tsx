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
} from "../../../utils/permissions";
import {
  Shield,
  Users,
  Search,
  Save,
  X,
  CheckCircle,
  AlertTriangle,
  Building2,
  Settings,
  RotateCcw,
  Check,
  Crown,
  UserCheck,
  User,
  Loader,
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

const ROLE_CONFIG = {
  USER: { label: "Usuário", icon: User, color: "user" },
  ADMIN: { label: "Admin", icon: UserCheck, color: "admin" },
  SUPERADMIN: { label: "Super", icon: Crown, color: "super" },
} as const;

// Catálogo expandido com ícones
const CATALOG: Array<{
  group: string;
  icon: any;
  modules: Array<{
    key: PermissionModule;
    label: string;
    icon: any;
    actions: Array<{ key: PermissionAction; label: string; icon: any }>;
  }>;
}> = [
  {
    group: "Visão Geral",
    icon: Settings,
    modules: [
      {
        key: "dashboard",
        label: "Dashboard",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "exportPdf", label: "Exportar PDF", icon: Check },
        ],
      },
      {
        key: "painel_maquinas",
        label: "Painel • Máquinas",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "edit_paradas", label: "Editar", icon: Check },
        ],
      },
    ],
  },
  {
    group: "Operação & Paradas",
    icon: Settings,
    modules: [
      {
        key: "operacao",
        label: "Operação",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "start_parada", label: "Iniciar", icon: Check },
          { key: "finish_parada", label: "Finalizar", icon: Check },
        ],
      },
      {
        key: "paradas",
        label: "Paradas",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "create", label: "Cadastrar", icon: Check },
          { key: "edit", label: "Editar", icon: Check },
          { key: "whatsapp_send", label: "WhatsApp", icon: Check },
        ],
      },
    ],
  },
  {
    group: "Cadastros",
    icon: Users,
    modules: [
      {
        key: "maquinas",
        label: "Máquinas",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "add", label: "Adicionar", icon: Check },
          { key: "edit", label: "Editar", icon: Check },
          { key: "delete", label: "Excluir", icon: X },
        ],
      },
      {
        key: "secoes",
        label: "Seções",
        icon: Building2,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "add", label: "Adicionar", icon: Check },
          { key: "edit", label: "Editar", icon: Check },
          { key: "delete", label: "Excluir", icon: X },
        ],
      },
      {
        key: "contatos",
        label: "Contatos",
        icon: Users,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "add", label: "Adicionar", icon: Check },
          { key: "edit", label: "Editar", icon: Check },
          { key: "delete", label: "Excluir", icon: X },
        ],
      },
      {
        key: "usuarios",
        label: "Usuários",
        icon: Users,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "add", label: "Adicionar", icon: Check },
          { key: "edit", label: "Editar", icon: Check },
          { key: "delete", label: "Excluir", icon: X },
        ],
      },
    ],
  },
  {
    group: "Relatórios",
    icon: Settings,
    modules: [
      {
        key: "relatorios_paradas",
        label: "Relatórios • Paradas",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "exportPdf", label: "Exportar PDF", icon: Check },
        ],
      },
    ],
  },
  {
    group: "Integrações",
    icon: Settings,
    modules: [
      {
        key: "integracoes_whatsapp",
        label: "WhatsApp",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "open_whatsapp", label: "WhatsApp", icon: Check },
          { key: "copy_link", label: "Copiar link", icon: Check },
        ],
      },
    ],
  },
  {
    group: "Administração",
    icon: Building2,
    modules: [
      {
        key: "clientes",
        label: "Clientes (Fábricas)",
        icon: Building2,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "add", label: "Cadastrar", icon: Check },
          { key: "edit", label: "Editar", icon: Check },
          { key: "delete", label: "Excluir", icon: X },
        ],
      },
    ],
  },
  {
    group: "Configurações",
    icon: Settings,
    modules: [
      {
        key: "settings",
        label: "Configurações",
        icon: Settings,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "save", label: "Salvar", icon: Save },
        ],
      },
      {
        key: "permissoes",
        label: "Permissões (esta tela)",
        icon: Shield,
        actions: [
          { key: "view", label: "Visualizar", icon: Check },
          { key: "save", label: "Salvar", icon: Save },
        ],
      },
    ],
  },
];

export default function PermissoesAdmin() {
  const { isSuperAdmin } = usePermissions();

  // Sessão
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

  // Estados
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [matrix, setMatrix] = useState<PermissionMatrix>({});
  const [saving, setSaving] = useState(false);

  // Filtro de busca
  const filtered = useMemo(() => {
    const s = term.trim().toLowerCase();
    if (!s) return scopedUsers;
    return scopedUsers.filter(
      (u) =>
        (u.name || "").toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s)
    );
  }, [scopedUsers, term]);

  const baseMatrix = useMemo(
    () => ensurePermissions(selected?.permissoes || {}),
    [selected?.permissoes]
  );
  const dirty = useMemo(
    () => !deepEqual(matrix, baseMatrix),
    [matrix, baseMatrix]
  );

  // Limpa seleção se usuário sair do escopo
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

  // Helpers de permissões
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

  function resetToOriginal() {
    if (!selected) return;
    setMatrix(ensurePermissions(selected.permissoes || {}));
  }

  // Toast
  const [toast, setToast] = useState<
    { type: "ok"; msg: string } | { type: "err"; msg: string } | null
  >(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function save() {
    if (!selected || !dirty || !canSave) return;
    setSaving(true);

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
    } finally {
      setSaving(false);
    }
  }

  const blockView = !!sess && !canView;

  return (
    <ProtectedRoute
      requireSuperAdmin={isSuperAdmin}
      requireClientAdmin={!isSuperAdmin}
    >
      <Layout requireAuth={true}>
        <div className={styles.container}>
          {/* Header */}
          <header className={styles.topbar}>
            <div className={styles.titleWrap}>
              <h1 className={styles.pageTitle}>
                <Shield size={24} />
                Gerenciamento Avançado de Permissões
              </h1>
              <span className={styles.subtitle}>
                Configure permissões detalhadas por módulo e ação para cada
                usuário
              </span>
              {!canSave && (
                <div className={styles.readonlyBadge}>
                  <AlertTriangle size={14} />
                  Modo Somente Leitura
                </div>
              )}
            </div>

            <div className={styles.headerBadges}>
              <div className={styles.tenantBadge}>
                <Building2 size={16} />
                <span>{tenantName}</span>
              </div>
              <div className={styles.roleBadge}>
                {(() => {
                  const config = ROLE_CONFIG[myRole];
                  const Icon = config.icon;
                  return (
                    <>
                      <Icon size={16} />
                      {config.label}
                    </>
                  );
                })()}
              </div>
            </div>
          </header>

          {blockView && (
            <div className={styles.blockCard}>
              <div className={styles.blockIcon}>
                <Shield size={48} />
              </div>
              <h2 className={styles.blockTitle}>Acesso Restrito</h2>
              <p className={styles.blockText}>
                Você não possui permissão para acessar o gerenciamento avançado
                de permissões. Entre em contato com um administrador.
              </p>
            </div>
          )}

          {!blockView && (
            <>
              {/* Toast */}
              {toast && (
                <div
                  className={`${styles.toast} ${
                    toast.type === "ok"
                      ? styles.toastSuccess
                      : styles.toastError
                  }`}
                >
                  {toast.type === "ok" ? (
                    <CheckCircle size={20} />
                  ) : (
                    <AlertTriangle size={20} />
                  )}
                  <span>{toast.msg}</span>
                  <button
                    className={styles.toastClose}
                    onClick={() => setToast(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className={styles.mainGrid}>
                {/* Coluna de Usuários */}
                <section className={styles.usersPanel}>
                  <div className={styles.panelHeader}>
                    <h3>
                      <Users size={20} />
                      Usuários ({filtered.length})
                    </h3>
                    <div className={styles.searchBox}>
                      <Search size={18} />
                      <input
                        className={styles.searchInput}
                        placeholder="Buscar usuário…"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                      />
                      {term && (
                        <button
                          className={styles.clearSearch}
                          onClick={() => setTerm("")}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.usersList}>
                    {isLoading ? (
                      <div className={styles.loading}>
                        <Loader size={24} className={styles.spinner} />
                        Carregando usuários…
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className={styles.empty}>
                        {term
                          ? "Nenhum usuário encontrado"
                          : "Nenhum usuário disponível"}
                      </div>
                    ) : (
                      filtered.map((u) => {
                        const config = ROLE_CONFIG[u.role];
                        const Icon = config.icon;
                        const active = selected?.id === u.id;

                        return (
                          <button
                            key={u.id}
                            className={`${styles.userItem} ${
                              active ? styles.active : ""
                            }`}
                            onClick={() => selectUser(u)}
                          >
                            <div className={styles.userAvatar}>
                              {(u.name || u.email).charAt(0).toUpperCase()}
                            </div>
                            <div className={styles.userInfo}>
                              <div className={styles.userName}>
                                {u.name || "Usuário"}
                              </div>
                              <div className={styles.userEmail}>{u.email}</div>
                            </div>
                            <div
                              className={`${styles.userRole} ${
                                styles[`role${u.role}`]
                              }`}
                            >
                              <Icon size={14} />
                              <span>{config.label}</span>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                {/* Painel de Permissões */}
                <section className={styles.permissionsPanel}>
                  {!selected ? (
                    <div className={styles.emptyState}>
                      <Shield size={64} />
                      <h3>Selecione um Usuário</h3>
                      <p>
                        Escolha um usuário da lista ao lado para configurar suas
                        permissões
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Header do usuário selecionado */}
                      <div className={styles.selectedUserHeader}>
                        <div className={styles.selectedUserInfo}>
                          <div className={styles.selectedUserAvatar}>
                            {(selected.name || selected.email)
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                          <div>
                            <h3>{selected.name || "Usuário"}</h3>
                            <div className={styles.selectedUserEmail}>
                              {selected.email}
                            </div>
                            <div
                              className={`${styles.selectedUserRole} ${
                                styles[`role${selected.role}`]
                              }`}
                            >
                              {(() => {
                                const config = ROLE_CONFIG[selected.role];
                                const Icon = config.icon;
                                return (
                                  <>
                                    <Icon size={16} />
                                    {config.label}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        <div className={styles.actionButtons}>
                          {dirty && (
                            <button
                              className={styles.resetBtn}
                              onClick={resetToOriginal}
                              title="Descartar alterações"
                            >
                              <RotateCcw size={16} />
                              Descartar
                            </button>
                          )}

                          <button
                            className={styles.saveBtn}
                            disabled={!dirty || !canSave || saving}
                            onClick={save}
                            title={
                              !canSave
                                ? "Sem permissão para salvar"
                                : !dirty
                                ? "Nenhuma alteração para salvar"
                                : "Salvar alterações"
                            }
                          >
                            {saving ? (
                              <>
                                <Loader size={16} className={styles.spinner} />
                                Salvando…
                              </>
                            ) : (
                              <>
                                <Save size={16} />
                                Salvar Alterações
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Grupos de Permissões */}
                      <div className={styles.permissionsContent}>
                        {CATALOG.map((group) => {
                          const GroupIcon = group.icon;

                          return (
                            <div
                              key={group.group}
                              className={styles.permissionGroup}
                            >
                              <div className={styles.groupHeader}>
                                <GroupIcon size={20} />
                                <h4>{group.group}</h4>
                              </div>

                              <div className={styles.modulesGrid}>
                                {group.modules.map((module) => {
                                  const ModuleIcon = module.icon;
                                  const actionKeys = module.actions.map(
                                    (a) => a.key
                                  );
                                  const allChecked = moduleAllChecked(
                                    module.key,
                                    actionKeys
                                  );

                                  return (
                                    <div
                                      key={module.key}
                                      className={styles.moduleCard}
                                      data-module={module.key}
                                    >
                                      <div className={styles.moduleHeader}>
                                        <div className={styles.moduleTitle}>
                                          <ModuleIcon size={18} />
                                          <span>{module.label}</span>
                                        </div>

                                        <label
                                          className={styles.selectAllToggle}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={allChecked}
                                            onChange={(e) =>
                                              toggleModuleAll(
                                                module.key,
                                                actionKeys,
                                                e.target.checked
                                              )
                                            }
                                            disabled={!canSave}
                                          />
                                          <span
                                            className={styles.toggleSlider}
                                          ></span>
                                          <span className={styles.toggleLabel}>
                                            Tudo
                                          </span>
                                        </label>
                                      </div>

                                      <div className={styles.actionsGrid}>
                                        {module.actions.map((action) => {
                                          const ActionIcon = action.icon;
                                          const checked = isChecked(
                                            module.key,
                                            action.key
                                          );

                                          return (
                                            <label
                                              key={action.key}
                                              className={`${
                                                styles.actionChip
                                              } ${
                                                checked ? styles.checked : ""
                                              }`}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) =>
                                                  setAction(
                                                    module.key,
                                                    action.key,
                                                    e.target.checked
                                                  )
                                                }
                                                disabled={!canSave}
                                              />
                                              <ActionIcon size={14} />
                                              <span>{action.label}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
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
