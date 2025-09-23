// pages/contatos/index.tsx
import { useState, useMemo } from "react";
import useSWR, { mutate } from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { Trash2, Users, Pencil } from "lucide-react";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

type Contato = { id: string; nome: string; celular: string };
type TenantRes =
  | { ok: true; data: { id: string; name: string } | null }
  | { ok: false; message: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ===================== Helpers de telefone (BR) ===================== */
function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
/** Normaliza para salvar em E.164 BR: +55DDDNÚMERO */
function normalizeForSave(inputLocal: string) {
  const digits = onlyDigits(inputLocal);
  if (!digits) return "+55";
  const with55 = digits.startsWith("55") ? digits : `55${digits}`;
  return `+${with55}`;
}
/** Remove o 55 inicial, retornando apenas DDD+numero (para o input) */
function toLocalDigitsFromStored(stored: string) {
  const d = onlyDigits(stored);
  return d.startsWith("55") ? d.slice(2) : d;
}
/** Exibe sempre com +55 e máscara legível */
function prettyFromStored(stored: string) {
  const d = onlyDigits(stored);
  const with55 = d.startsWith("55") ? d : `55${d}`;
  const country = "+55";
  const rest = with55.slice(2);
  const ddd = rest.slice(0, 2);
  const number = rest.slice(2);
  if (!ddd) return country;

  if (number.length >= 9) {
    const n1 = number.slice(0, 5);
    const n2 = number.slice(5, 9);
    return `${country} (${ddd}) ${n1}${n2 ? "-" + n2 : ""}`;
  } else {
    const n1 = number.slice(0, 4);
    const n2 = number.slice(4, 8);
    return `${country} (${ddd}) ${n1}${n2 ? "-" + n2 : ""}`;
  }
}
/** Máscara enquanto digita APENAS para o local (sem +55), ex: (11) 98765-4321 */
function maskLocalTyping(localDigits: string) {
  const d = onlyDigits(localDigits).slice(0, 11); // DDD (2) + num (8/9)
  const ddd = d.slice(0, 2);
  const num = d.slice(2);

  if (d.length <= 2) return ddd;
  if (num.length > 5) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5, 9)}`;
  if (num.length > 0) return `(${ddd}) ${num}`;
  return `(${ddd}`;
}

/* ===================== Página ===================== */
export default function ContatosPage() {
  // 🔐 Sessão para permissões
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "contatos", a);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canAdd = useMemo(() => can("add"), [sess, myRole]);
  const canEdit = useMemo(() => can("edit"), [sess, myRole]);
  const canDelete = useMemo(() => can("delete"), [sess, myRole]);

  // Se não pode visualizar, bloqueia a página
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <strong>Sem acesso a Contatos.</strong>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Solicite ao administrador permissão de visualização.
          </div>
        </div>
      </Layout>
    );
  }

  // 1) Descobre tenant atual
  const { data: tRes } = useSWR<TenantRes>("/api/tenant/current", fetcher);
  const tenantId =
    tRes && "ok" in tRes && tRes.ok ? tRes.data?.id ?? null : null;
  const tenantName =
    tRes && "ok" in tRes && tRes.ok && tRes.data?.name
      ? tRes.data.name
      : "Sua Empresa";

  // 2) Só busca contatos quando houver tenantId definido
  const { data } = useSWR<{ data: Contato[] }>(
    tenantId ? "/api/contatos" : null,
    fetcher
  );
  const contatos = data?.data ?? [];

  // Form local (sem +55)
  const [form, setForm] = useState<{
    id?: string;
    nome: string;
    celularLocal: string; // DDD+numero (sem +55)
  }>({ nome: "", celularLocal: "" });
  const isEdit = !!form.id;

  // Modal de exclusão
  const [confirm, setConfirm] = useState<{ id: string; nome: string } | null>(
    null
  );

  function handleCelularChange(v: string) {
    const digits = onlyDigits(v).slice(0, 11);
    setForm((s) => ({ ...s, celularLocal: digits }));
  }

  function maskedInputValue() {
    return maskLocalTyping(form.celularLocal);
  }

  function isValidLocal(digits: string) {
    return digits.length === 10 || digits.length === 11;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) {
      alert("Selecione uma fábrica/cliente antes de cadastrar contatos.");
      return;
    }

    // 🔐 Guarda extra no client
    if ((!isEdit && !canAdd) || (isEdit && !canEdit)) {
      alert("Você não tem permissão para realizar esta ação.");
      return;
    }

    const localDigits = onlyDigits(form.celularLocal);

    if (!isValidLocal(localDigits)) {
      alert("Informe um telefone válido com DDD (10 ou 11 dígitos).");
      return;
    }

    const payload = {
      nome: form.nome.trim(),
      celular: normalizeForSave(localDigits), // sempre +55...
    };

    const res = await fetch(
      isEdit ? `/api/contatos/${form.id}` : "/api/contatos",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      setForm({ nome: "", celularLocal: "" });
      mutate("/api/contatos");
    }
  }

  // abre modal
  function askDelete(id: string, nome: string) {
    // 🔐 guarda extra no client
    if (!canDelete) return;
    setConfirm({ id, nome });
  }

  // confirma exclusão
  async function onDelete(id: string) {
    // 🔐 guarda extra no client
    if (!canDelete) return;

    const res = await fetch(`/api/contatos/${id}`, { method: "DELETE" });
    setConfirm(null);
    if (res.ok) mutate("/api/contatos");
  }

  // Mostrar coluna de ações apenas se houver algo para mostrar
  const showActions = canEdit || canDelete;

  return (
    <Layout requireAuth={true}>
      <h1 className={styles.title}>
        <Users size={22} /> Contatos{" "}
        <span className={styles.dim} title="Cliente/Fábrica em uso">
          — {tenantName}
        </span>
      </h1>

      {!tenantId && (
        <div className={styles.empty}>
          Selecione uma fábrica/cliente para visualizar e cadastrar contatos.
        </div>
      )}

      {/* Formulário (respeita permissões: add/edit) */}
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.row}>
          <div className={styles.col}>
            <label className={styles.label}>Nome</label>
            <input
              className={styles.input}
              value={form.nome}
              onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
              required
              placeholder="Ex.: João da Silva"
              disabled={!tenantId || (isEdit ? !canEdit : !canAdd)}
            />
          </div>
          <div className={styles.col}>
            <label className={styles.label}>Celular (Brasil)</label>
            <input
              className={styles.input}
              value={maskedInputValue()}
              onChange={(e) => handleCelularChange(e.target.value)}
              placeholder="(11) 9XXXX-XXXX"
              inputMode="numeric"
              required
              disabled={!tenantId || (isEdit ? !canEdit : !canAdd)}
            />
            <small className={styles.hint}>
              Salvo como <strong>+55DDDNÚMERO</strong> para WhatsApp (E.164).
            </small>
          </div>
        </div>

        <div className={styles.actions}>
          {(isEdit ? canEdit : canAdd) && (
            <button
              className={styles.primaryBtn}
              type="submit"
              disabled={!tenantId}
            >
              {isEdit ? "Salvar" : "Adicionar"}
            </button>
          )}
          {isEdit && canEdit && (
            <button
              className={styles.ghostBtn}
              type="button"
              onClick={() => setForm({ nome: "", celularLocal: "" })}
              disabled={!tenantId}
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
              <th>Nome</th>
              <th>Celular</th>
              {showActions && <th style={{ width: 220 }}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {tenantId &&
              contatos.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{prettyFromStored(c.celular)}</td>
                  {showActions && (
                    <td>
                      <div className={styles.tableActions}>
                        {canEdit && (
                          <button
                            className={styles.tableBtn}
                            onClick={() =>
                              setForm({
                                id: c.id,
                                nome: c.nome,
                                celularLocal: toLocalDigitsFromStored(
                                  c.celular
                                ),
                              })
                            }
                          >
                            <Pencil size={16} />
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className={styles.tableBtnDanger}
                            onClick={() => askDelete(c.id, c.nome)}
                          >
                            <Trash2 size={16} />
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}

            {tenantId && contatos.length === 0 && (
              <tr>
                <td colSpan={showActions ? 3 : 2} className={styles.empty}>
                  Nenhum contato.
                </td>
              </tr>
            )}

            {!tenantId && (
              <tr>
                <td colSpan={showActions ? 3 : 2} className={styles.empty}>
                  Selecione uma fábrica/cliente para listar os contatos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Modal de confirmação ===== */}
      {confirm && canDelete && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setConfirm(null)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={styles.modalIcon}>
              <Trash2 />
            </div>
            <h4 className={styles.modalTitle}>Excluir contato?</h4>
            <p className={styles.modalText}>
              Tem certeza que deseja excluir <strong>{confirm.nome}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.ghostBtn}
                onClick={() => setConfirm(null)}
              >
                <Pencil size={16} />
                Cancelar
              </button>
              <button
                className={styles.dangerBtn}
                onClick={() => onDelete(confirm.id)}
              >
                <Trash2 size={16} />
                Excluir
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
