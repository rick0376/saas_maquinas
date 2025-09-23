// pages/secoes/index.tsx
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { Layers, Plus, Pencil, Trash2 } from "lucide-react";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

type Secao = {
  id: string;
  nome: string;
  descricao: string | null;
  paiId: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SecoesPage() {
  // 🔐 Sessão para checar permissões
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "secoes", a);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canAdd = useMemo(() => can("add"), [sess, myRole]);
  const canEdit = useMemo(() => can("edit"), [sess, myRole]);
  const canDelete = useMemo(() => can("delete"), [sess, myRole]);

  // Se não pode visualizar, bloqueia a página
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <strong>Sem acesso às Seções.</strong>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Contate o administrador para obter permissão de visualização.
          </div>
        </div>
      </Layout>
    );
  }

  // Seções
  const { data, isLoading } = useSWR<{ data: Secao[] }>("/api/secoes", fetcher);
  const secoes = data?.data ?? [];

  // Tenant atual (cliente/fábrica)
  const { data: tenantResp } = useSWR<{
    ok: boolean;
    data: { id: string; name: string } | null;
  }>("/api/tenant/current", fetcher);
  const tenantName = tenantResp?.data?.name ?? "Sua Empresa";

  const [form, setForm] = useState<{
    id?: string;
    nome: string;
    descricao?: string;
    paiId?: string | null;
  }>({
    nome: "",
    descricao: "",
    paiId: null,
  });

  const [confirm, setConfirm] = useState<{ id: string; nome: string } | null>(
    null
  );

  const isEdit = !!form.id;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // 🔐 Guarda extra no client
    if ((!isEdit && !canAdd) || (isEdit && !canEdit)) return;

    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao?.trim() || null,
      // garante que não salva a própria seção como pai
      paiId: form.paiId && form.paiId !== form.id ? form.paiId : null,
    };
    const res = await fetch(isEdit ? `/api/secoes/${form.id}` : "/api/secoes", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setForm({ nome: "", descricao: "", paiId: null });
      mutate("/api/secoes");
    }
  }

  async function onDelete(id: string) {
    // 🔐 Guarda extra no client
    if (!canDelete) return;

    const res = await fetch(`/api/secoes/${id}`, { method: "DELETE" });
    setConfirm(null);
    if (res.ok) mutate("/api/secoes");
  }

  const opcoesPai = useMemo(
    () =>
      secoes.map((s) => ({
        value: s.id,
        label: s.nome,
      })),
    [secoes]
  );

  // Se nenhum dos botões (editar/excluir) é permitido, escondemos a coluna Ações
  const showActionsColumn = canEdit || canDelete;

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <div className={styles.titleRow}>
          <Layers size={18} />
          <h1>
            Seções <span style={{ opacity: 0.75 }}>— {tenantName}</span>
          </h1>
        </div>
        <span className={styles.hintLay}>
          Crie, edite e organize a hierarquia de seções (Planta → Setor →
          Célula).
        </span>
      </div>

      {/* Formulário */}
      <form className={styles.formCard} onSubmit={onSubmit}>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label}>Nome</label>
            <input
              className={styles.input}
              value={form.nome}
              onChange={(e) => setForm((s) => ({ ...s, nome: e.target.value }))}
              placeholder="Ex.: Setor A"
              required
              disabled={isEdit ? !canEdit : !canAdd}
            />
            <span className={styles.hint}>Exibição principal da seção</span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Seção Pai (opcional)</label>
            <select
              className={styles.input}
              value={form.paiId ?? ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, paiId: e.target.value || null }))
              }
              disabled={isEdit ? !canEdit : !canAdd}
            >
              <option value="">— Sem pai —</option>
              {opcoesPai
                .filter((o) => o.value !== form.id) // evita escolher a si mesmo
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </select>
            <span className={styles.hint}>
              Use para montar a árvore (ex.: “Célula 01” com pai “Setor A”)
            </span>
          </div>

          <div className={styles.fieldFull}>
            <label className={styles.label}>Descrição</label>
            <input
              className={styles.input}
              value={form.descricao ?? ""}
              onChange={(e) =>
                setForm((s) => ({ ...s, descricao: e.target.value }))
              }
              placeholder="Ex.: Montagem"
              disabled={isEdit ? !canEdit : !canAdd}
            />
          </div>
        </div>

        <div className={styles.actions}>
          {(isEdit ? canEdit : canAdd) && (
            <button className={styles.primaryBtn} type="submit">
              <Plus size={16} />
              {isEdit ? "Salvar" : "Adicionar"}
            </button>
          )}
          {isEdit && canEdit && (
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={() => setForm({ nome: "", descricao: "", paiId: null })}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {/* Tabela */}
      <div className={styles.tableCard}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Seção Pai</th>
                {showActionsColumn && (
                  <th className={styles.colActions}>Ações</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={showActionsColumn ? 4 : 3}
                    className={styles.centerCell}
                  >
                    Carregando…
                  </td>
                </tr>
              ) : secoes.length === 0 ? (
                <tr>
                  <td
                    colSpan={showActionsColumn ? 4 : 3}
                    className={styles.centerCell}
                  >
                    Nenhuma seção cadastrada.
                  </td>
                </tr>
              ) : (
                secoes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className={styles.cellTitle}>{s.nome}</div>
                    </td>
                    <td className={styles.cellMuted}>{s.descricao || "—"}</td>
                    <td className={styles.cellMuted}>
                      {secoes.find((x) => x.id === s.paiId)?.nome || "—"}
                    </td>
                    {showActionsColumn && (
                      <td className={styles.cellActions}>
                        {canEdit && (
                          <button
                            className={`${styles.actionBtn} ${styles.editBtn}`}
                            type="button"
                            onClick={() =>
                              setForm({
                                id: s.id,
                                nome: s.nome,
                                descricao: s.descricao || "",
                                paiId: s.paiId,
                              })
                            }
                            title="Editar"
                          >
                            <Pencil size={16} />
                            Editar
                          </button>
                        )}
                        {canDelete && (
                          <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            type="button"
                            onClick={() =>
                              setConfirm({ id: s.id, nome: s.nome })
                            }
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                            Excluir
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de confirmação */}
      {confirm && canDelete && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setConfirm(null)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={styles.modalIcon}>
              <Trash2 size={20} />
            </div>
            <h4 className={styles.modalTitle}>Excluir seção?</h4>
            <p className={styles.modalText}>
              Tem certeza que deseja excluir <strong>{confirm.nome}</strong>?
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
              >
                Excluir
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
