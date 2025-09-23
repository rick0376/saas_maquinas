// pages/usuarios/index.tsx
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { Users } from "lucide-react";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

type Usuario = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  tenantId?: string | null;
};

type TenantRes =
  | { ok: true; data: { id: string; name: string } | null }
  | { ok: false; message: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const raw = document.cookie || "";
  const found = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=")[1]) : null;
}

export default function UsuariosPage() {
  // 🔐 Sessão p/ permissões
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "usuarios", a);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canAdd = useMemo(() => can("add"), [sess, myRole]);
  const canEdit = useMemo(() => can("edit"), [sess, myRole]);
  const canDelete = useMemo(() => can("delete"), [sess, myRole]);

  // 🔒 Bloqueia a página se não puder visualizar
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <strong>Sem acesso a Usuários.</strong>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Solicite ao administrador permissão de visualização.
          </div>
        </div>
      </Layout>
    );
  }

  // Lista de usuários
  const { data, mutate } = useSWR<{ data: Usuario[] }>(
    "/api/usuarios",
    fetcher,
    { revalidateOnFocus: false }
  );
  const usuarios = data?.data ?? [];

  // Quem eu sou (role / tenantId da sessão) — mantido para sua lógica de tenant
  const [myTenantId, setMyTenantId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetch("/api/auth/session");
      const s = r.ok ? await r.json() : null;
      if (!active) return;
      const tId = (s?.user?.tenantId as string) ?? null;
      setMyTenantId(tId);
    })();
    return () => {
      active = false;
    };
  }, []);

  // Descobrir "tenant atual" (para o cabeçalho)
  const { data: tRes } = useSWR<TenantRes>("/api/tenant/current", fetcher);
  const tenantName =
    (tRes && "ok" in tRes && tRes.ok && tRes.data?.name) ||
    (tRes?.ok && !tRes.data ? "Todos (agregado)" : "Sua Empresa");
  const currentTenantId =
    (tRes && "ok" in tRes && tRes.ok && tRes.data?.id) || null;

  // Cookies de modo admin / cliente selecionado
  const adminMode = getCookie("adminMode") === "1";
  const selectedTenantId = getCookie("selectedTenantId") || null;
  const isSuper = myRole === "SUPERADMIN";
  const isAggregated = isSuper && (!adminMode || !selectedTenantId);

  // Form
  const [form, setForm] = useState<{
    id?: string;
    email: string;
    name: string;
    password: string;
    role: Role;
  }>({
    email: "",
    name: "",
    password: "",
    role: "USER",
  });

  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Usuario | null>(null);
  const isEdit = !!form.id;

  // Permite SUPERADMIN escolher SUPERADMIN global no agregado sem precisar selecionar cliente
  const canCreateGlobalSuper =
    isAggregated && !isEdit && form.role === "SUPERADMIN";

  // Caso tente criar USER/ADMIN no agregado (sem cliente), bloqueia
  const creatingUserOrAdminOnAggregated =
    isAggregated && !isEdit && (form.role === "USER" || form.role === "ADMIN");

  // opções de perfil (apenas SUPERADMIN pode criar SUPERADMIN)
  const roleOptions: Role[] = useMemo(
    () => (isSuper ? ["USER", "ADMIN", "SUPERADMIN"] : ["USER", "ADMIN"]),
    [isSuper]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 🔐 guarda extra: sem permissão não envia
    if ((!isEdit && !canAdd) || (isEdit && !canEdit)) {
      setFlash("Você não tem permissão para realizar esta ação.");
      setTimeout(() => setFlash(null), 2200);
      return;
    }

    if (creatingUserOrAdminOnAggregated) {
      setFlash("Selecione um cliente antes de criar USER/ADMIN.");
      setTimeout(() => setFlash(null), 2400);
      return;
    }

    setSaving(true);

    // Decide tenantId a ser enviado
    let desiredTenantId: string | null = null;

    if (form.role === "SUPERADMIN") {
      if (isAggregated && !isEdit) {
        desiredTenantId = null; // super global
      } else {
        desiredTenantId = selectedTenantId || myTenantId || null;
      }
    } else {
      // USER/ADMIN precisam de tenant
      if (isSuper) {
        desiredTenantId = selectedTenantId || myTenantId;
      } else {
        desiredTenantId = myTenantId;
      }
    }

    const payload: any = {
      email: form.email.trim(),
      name: form.name.trim(),
      role: form.role,
      tenantId: desiredTenantId,
    };
    if (!isEdit) payload.password = form.password;

    const res = await fetch(
      isEdit ? `/api/usuarios/${form.id}` : "/api/usuarios",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    setSaving(false);

    if (res.ok) {
      setForm({ email: "", name: "", password: "", role: "USER" });
      mutate();
      globalMutate("/api/usuarios");
      setFlash(isEdit ? "Usuário atualizado." : "Usuário criado.");
      setTimeout(() => setFlash(null), 2500);
    } else {
      const txt = await res.text().catch(() => "");
      setFlash(`Falha ao salvar usuário. ${txt || ""}`.trim());
      setTimeout(() => setFlash(null), 2500);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;

    // 🔐 guarda extra: sem permissão não envia
    if (!canDelete) {
      setToDelete(null);
      setFlash("Você não tem permissão para excluir.");
      setTimeout(() => setFlash(null), 2200);
      return;
    }

    const res = await fetch(`/api/usuarios/${toDelete.id}`, {
      method: "DELETE",
    });
    setToDelete(null);
    if (res.ok) {
      mutate();
      globalMutate("/api/usuarios");
      setFlash("Usuário excluído.");
      setTimeout(() => setFlash(null), 2200);
    } else {
      setFlash("Falha ao excluir usuário.");
      setTimeout(() => setFlash(null), 2500);
    }
  }

  const showActions = canEdit || canDelete;

  const disableFields = isEdit ? !canEdit : !canAdd; // campos do form desabilitados conforme ação

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>
            <Users size={22} /> Usuários{" "}
            {tenantName && (
              <span className={styles.tenantPill}>— {tenantName}</span>
            )}
          </h1>
        </div>

        {flash && (
          <div className={styles.toast} role="status" aria-live="polite">
            {flash}
          </div>
        )}
      </div>

      {/* Avisos de contexto */}
      {creatingUserOrAdminOnAggregated && (
        <div className={styles.warn}>
          Você está em modo agregado (sem cliente selecionado). Para criar
          <strong> USER </strong> ou <strong> ADMIN</strong>, selecione um
          cliente primeiro (Clientes → Usar este cliente).
        </div>
      )}
      {canCreateGlobalSuper && (
        <div className={styles.info}>
          Criando <strong>SUPERADMIN global</strong> (sem fábrica vinculada).
        </div>
      )}

      {/* Formulário — respeita permissões add/edit */}
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              value={form.email}
              onChange={(e) =>
                setForm((s) => ({ ...s, email: e.target.value }))
              }
              placeholder="usuario@empresa.com"
              type="email"
              required
              disabled={isEdit || disableFields}
            />
          </div>

          <div className={styles.col}>
            <label className={styles.label}>Nome</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="Nome do usuário"
              disabled={disableFields}
            />
          </div>

          {!isEdit && (
            <div className={styles.col}>
              <label className={styles.label}>Senha</label>
              <input
                className={styles.input}
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((s) => ({ ...s, password: e.target.value }))
                }
                placeholder="Defina uma senha"
                required
                disabled={disableFields}
              />
            </div>
          )}

          <div className={styles.col}>
            <label className={styles.label}>Perfil</label>
            <select
              className={styles.input}
              value={form.role}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  role: e.target.value as Role,
                }))
              }
              disabled={disableFields}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          {/* Botão principal só aparece se tiver permissão para a ação ativa */}
          {(!isEdit && canAdd) || (isEdit && canEdit) ? (
            <button
              className={styles.primaryBtn}
              type="submit"
              disabled={
                saving || (creatingUserOrAdminOnAggregated && !isEdit) // regra de tenant p/ criação
              }
            >
              {saving ? "Salvando..." : isEdit ? "Salvar" : "Adicionar"}
            </button>
          ) : null}

          {isEdit && canEdit && (
            <button
              className={styles.ghostBtn}
              type="button"
              onClick={() =>
                setForm({ email: "", name: "", password: "", role: "USER" })
              }
              disabled={saving}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nome</th>
              <th>Perfil</th>
              {showActions && <th style={{ width: 200 }}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.name || "—"}</td>
                <td>
                  <span
                    className={`${styles.roleBadge} ${
                      u.role === "SUPERADMIN"
                        ? styles.roleSuper
                        : u.role === "ADMIN"
                        ? styles.roleAdmin
                        : styles.roleUser
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                {showActions && (
                  <td>
                    <div className={styles.rowActions}>
                      {canEdit && (
                        <button
                          className={styles.smallBtn}
                          onClick={() =>
                            setForm({
                              id: u.id,
                              email: u.email,
                              name: u.name || "",
                              password: "",
                              role: u.role,
                            })
                          }
                        >
                          Editar
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className={styles.smallDanger}
                          onClick={() => setToDelete(u)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={showActions ? 4 : 3} className={styles.empty}>
                  Nenhum usuário.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de confirmação de exclusão (só mostra se puder excluir) */}
      {toDelete && canDelete && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setToDelete(null)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={styles.modalCard}>
              <h4 className={styles.modalTitle}>Excluir usuário?</h4>
              <p className={styles.modalText}>
                Tem certeza que deseja excluir <strong>{toDelete.email}</strong>
                ? Essa ação não pode ser desfeita.
              </p>
              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setToDelete(null)}
                >
                  Cancelar
                </button>
                <button className={styles.dangerBtn} onClick={confirmDelete}>
                  Excluir agora
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
