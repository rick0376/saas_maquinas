// pages/painel/maquinas/index.tsx
import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import {
  Wrench,
  Pencil,
  Trash2,
  Plus,
  XCircle,
  AlertCircle,
} from "lucide-react";

// ===== Permissões =====
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

type Secao = { id: string; nome: string };
type Maquina = {
  id: string;
  codigo: string;
  nome: string;
  status: "ATIVA" | "PARADA" | "MANUTENCAO";
  secao?: Secao | null;
  secaoId?: string | null;
};

// ===== Paradas em andamento (mínimo necessário p/ classificar UI) =====
type ParadaTipo = "OPERACIONAL" | "NAO_OPERACIONAL";
type ParadaCategoria =
  // Operacionais
  | "MANUTENCAO_CORRETIVA"
  | "MANUTENCAO_PREVENTIVA"
  | "SETUP_TROCA_FERRAMENTA"
  | "FALTA_MATERIAL"
  | "QUALIDADE_INSPECAO"
  | "AJUSTE_PROCESSO"
  | "ABASTECIMENTO"
  | "LIMPEZA"
  // Não operacionais
  | "ALMOCO"
  | "BANHEIRO"
  | "REUNIAO"
  | "TREINAMENTO"
  | "DDS"
  | "OUTROS_NAO_OPERACIONAL";

type Parada = {
  id: string;
  tipo?: ParadaTipo | null;
  categoria?: ParadaCategoria | null;
  maquina?: { id: string };
};

type UiStatus =
  | "ATIVA"
  | "PARADA"
  | "MANUTENCAO"
  | "MANUTENCAO_CORRETIVA"
  | "MANUTENCAO_PREVENTIVA"
  | "OPERACIONAL"
  | "NAO_OPERACIONAL";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ===== Regras de derivação do status visual a partir de tipo/categoria =====
function uiFromTipoCategoria(
  tipo?: ParadaTipo | null,
  cat?: ParadaCategoria | null
): UiStatus {
  if (cat === "MANUTENCAO_CORRETIVA") return "MANUTENCAO_CORRETIVA";
  if (cat === "MANUTENCAO_PREVENTIVA") return "MANUTENCAO_PREVENTIVA";

  if (
    cat === "SETUP_TROCA_FERRAMENTA" ||
    cat === "FALTA_MATERIAL" ||
    cat === "QUALIDADE_INSPECAO" ||
    cat === "AJUSTE_PROCESSO" ||
    cat === "ABASTECIMENTO" ||
    cat === "LIMPEZA"
  )
    return "OPERACIONAL";

  if (
    cat === "ALMOCO" ||
    cat === "BANHEIRO" ||
    cat === "REUNIAO" ||
    cat === "TREINAMENTO" ||
    cat === "DDS" ||
    cat === "OUTROS_NAO_OPERACIONAL"
  )
    return "NAO_OPERACIONAL";

  // fallback pela coluna tipo (para dados antigos sem categoria)
  if (tipo === "OPERACIONAL") return "OPERACIONAL";
  if (tipo === "NAO_OPERACIONAL") return "NAO_OPERACIONAL";

  return "PARADA";
}

function computeMachineUiStatus(maquina: Maquina, abertas: Parada[]): UiStatus {
  const ps = abertas.filter((p) => p.maquina?.id === maquina.id);
  if (ps.length === 0) {
    // Sem parada aberta → mantém status bruto
    return maquina.status;
  }
  // Prioridade: corretiva > preventiva > operacional > não operacional > parada
  if (ps.some((p) => p.categoria === "MANUTENCAO_CORRETIVA"))
    return "MANUTENCAO_CORRETIVA";
  if (ps.some((p) => p.categoria === "MANUTENCAO_PREVENTIVA"))
    return "MANUTENCAO_PREVENTIVA";
  if (
    ps.some((p) => uiFromTipoCategoria(p.tipo, p.categoria) === "OPERACIONAL")
  )
    return "OPERACIONAL";
  if (
    ps.some(
      (p) => uiFromTipoCategoria(p.tipo, p.categoria) === "NAO_OPERACIONAL"
    )
  )
    return "NAO_OPERACIONAL";
  return "PARADA";
}

function uiStatusLabel(s: UiStatus): string {
  switch (s) {
    case "ATIVA":
      return "FUNCIONANDO";
    case "MANUTENCAO_CORRETIVA":
      return "MANUTENÇÃO CORRETIVA";
    case "MANUTENCAO_PREVENTIVA":
      return "MANUTENÇÃO PREVENTIVA";
    case "OPERACIONAL":
      return "PARADA OPERACIONAL";
    case "NAO_OPERACIONAL":
      return "NÃO OPERACIONAL";
    case "MANUTENCAO":
      return "MANUTENÇÃO";
    default:
      return "PARADA";
  }
}

export default function MaquinasPage() {
  // ===== Sessão/Permissões (módulo: maquinas) =====
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (action: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "maquinas", action);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canAdd = useMemo(() => can("add"), [sess, myRole]);
  const canEdit = useMemo(() => can("edit"), [sess, myRole]);
  const canDelete = useMemo(() => can("delete"), [sess, myRole]);

  // Bloqueio se não pode ver
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className={`card ${styles.emptyCard}`} role="alert">
          <span className={styles.emptyTitle}>Sem acesso a Máquinas.</span>
          <span className={styles.emptyText}>
            Você não possui permissão para visualizar este módulo.
          </span>
        </div>
      </Layout>
    );
  }

  // Dados principais
  const { data: mData, isLoading: loadingM } = useSWR<{ data: Maquina[] }>(
    "/api/maquinas",
    fetcher
  );
  const { data: sData, isLoading: loadingS } = useSWR<{ data: Secao[] }>(
    "/api/secoes",
    fetcher
  );
  // Paradas em andamento para colorir status visual
  const { data: stData } = useSWR<{ data: Parada[] }>(
    "/api/operacao/status",
    fetcher
  );

  // Tenant atual
  const { data: tRes } = useSWR<{
    ok: boolean;
    data: { id: string; name: string } | null;
  }>("/api/tenant/current", fetcher);
  const tenantLabel = tRes ? tRes.data?.name || "Todos os clientes" : "…";

  const maquinas = mData?.data ?? [];
  const secoes = (sData?.data ?? []).map((s) => ({
    id: s.id,
    nome: (s as any).nome,
  })) as Secao[];
  const paradasAbertas = stData?.data ?? [];

  // Form
  const [form, setForm] = useState<{
    id?: string;
    codigo: string;
    nome: string;
    status: Maquina["status"];
    secaoId: string | "";
  }>({
    codigo: "",
    nome: "",
    status: "ATIVA",
    secaoId: "",
  });

  const [confirm, setConfirm] = useState<{ id: string; nome: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!form.id;
  const formDisabled = isEdit ? !canEdit : !canAdd;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isEdit && !canEdit) {
      setError("Sem permissão para editar máquinas.");
      return;
    }
    if (!isEdit && !canAdd) {
      setError("Sem permissão para adicionar máquinas.");
      return;
    }

    const codigoExiste = maquinas.some(
      (m) =>
        m.codigo.toLowerCase() === form.codigo.trim().toLowerCase() &&
        m.id !== form.id
    );
    if (codigoExiste) {
      setError(`O código "${form.codigo}" já está cadastrado!`);
      return;
    }
    setError(null);

    const payload = {
      codigo: form.codigo.trim(),
      nome: form.nome.trim(),
      status: form.status,
      secaoId: form.secaoId || null,
    };
    const res = await fetch(
      isEdit ? `/api/maquinas/${form.id}` : "/api/maquinas",
      {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (res.ok) {
      setForm({ codigo: "", nome: "", status: "ATIVA", secaoId: "" });
      mutate("/api/maquinas");
    } else {
      const txt = await res.text().catch(() => "");
      setError(txt || "Falha ao salvar máquina.");
    }
  }

  async function onDelete(id: string) {
    if (!canDelete) {
      setConfirm(null);
      alert("Sem permissão para excluir máquinas.");
      return;
    }
    const res = await fetch(`/api/maquinas/${id}`, { method: "DELETE" });
    setConfirm(null);
    if (res.ok) mutate("/api/maquinas");
  }

  // Badge com cores por UiStatus (usa classes novas; cai no fallback antigo se não existirem)
  const statusBadge = (ui: UiStatus) => {
    const fallback =
      ui === "ATIVA"
        ? `${styles.badge} ${styles.on}`
        : ui === "MANUTENCAO"
        ? `${styles.badge} ${styles.maint}`
        : `${styles.badge} ${styles.off}`;

    const specific =
      ui === "MANUTENCAO_CORRETIVA"
        ? `${styles.badge} ${styles.badgeManCor}`
        : ui === "MANUTENCAO_PREVENTIVA"
        ? `${styles.badge} ${styles.badgeManPrev}`
        : ui === "OPERACIONAL"
        ? `${styles.badge} ${styles.badgeOper}`
        : ui === "NAO_OPERACIONAL"
        ? `${styles.badge} ${styles.badgeNaoOp}`
        : "";

    const cls = specific || fallback;
    return <span className={cls}>{uiStatusLabel(ui)}</span>;
  };

  // Agrupa por seção e injeta o UiStatus calculado
  const grupos = useMemo(() => {
    const g: Record<string, (Maquina & { __ui: UiStatus })[]> = {};
    for (const m of maquinas) {
      const ui = computeMachineUiStatus(m, paradasAbertas);
      const key = m.secao?.nome || "Sem seção";
      (g[key] ||= []).push({ ...m, __ui: ui });
    }
    for (const key in g)
      g[key].sort((a, b) => a.codigo.localeCompare(b.codigo));
    return g;
  }, [maquinas, paradasAbertas]);

  return (
    <Layout requireAuth={true}>
      {/* Topbar */}
      <div className={styles.page}>
        <div className={styles.topbar}>
          <div className={styles.titleRow}>
            <Wrench size={18} />
            <h1>
              Máquinas - <strong>{tenantLabel}</strong>
            </h1>
          </div>
          <span className={styles.hint}>
            Cadastre, edite e visualize o status das máquinas por seção.
          </span>
        </div>

        {/* Formulário */}
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label}>Código</label>
              <input
                className={styles.input}
                value={form.codigo}
                onChange={(e) =>
                  setForm((s) => ({ ...s, codigo: e.target.value }))
                }
                required
                placeholder="EX: MX-100"
                disabled={formDisabled}
              />
            </div>
            <div className={styles.col}>
              <label className={styles.label}>Nome</label>
              <input
                className={styles.input}
                value={form.nome}
                onChange={(e) =>
                  setForm((s) => ({ ...s, nome: e.target.value }))
                }
                required
                placeholder="Ex: Torno CNC A"
                disabled={formDisabled}
              />
            </div>
            <div className={styles.col}>
              <label className={styles.label}>Seção</label>
              <select
                className={styles.input}
                value={form.secaoId}
                onChange={(e) =>
                  setForm((s) => ({ ...s, secaoId: e.target.value }))
                }
                disabled={loadingS || formDisabled}
              >
                <option value="">— Sem seção —</option>
                {secoes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.col}>
              <label className={styles.label}>Status</label>
              <select
                className={styles.input}
                value={form.status}
                onChange={(e) =>
                  setForm((s) => ({ ...s, status: e.target.value as any }))
                }
                disabled={formDisabled}
              >
                <option value="ATIVA">ATIVA</option>
                <option value="PARADA">PARADA</option>
                <option value="MANUTENCAO">MANUTENÇÃO</option>
              </select>
            </div>
          </div>

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.primaryBtn}
              type="submit"
              disabled={formDisabled}
              title={
                formDisabled
                  ? isEdit
                    ? "Sem permissão para editar"
                    : "Sem permissão para adicionar"
                  : isEdit
                  ? "Salvar alterações"
                  : "Adicionar máquina"
              }
            >
              <Plus size={16} />
              {isEdit ? "Salvar" : "Adicionar"}
            </button>

            {isEdit && (
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={() =>
                  setForm({
                    codigo: "",
                    nome: "",
                    status: "ATIVA",
                    secaoId: "",
                  })
                }
              >
                <XCircle size={16} />
                Cancelar
              </button>
            )}
          </div>
        </form>

        {/* Cards por seção */}
        <div className={styles.sectionsScroll}>
          <div className={styles.sectionsGrid}>
            {loadingM ? (
              <section className={`card ${styles.loadingCard}`}>
                <div className={styles.spinner} />
                <span>Carregando máquinas…</span>
              </section>
            ) : Object.keys(grupos).length === 0 ? (
              <section className={`card ${styles.emptyCard}`}>
                <span className={styles.emptyTitle}>
                  Nenhuma máquina encontrada
                </span>
                <span className={styles.emptyText}>
                  Use o formulário acima para cadastrar.
                </span>
              </section>
            ) : (
              Object.entries(grupos).map(([secao, list]) => (
                <section key={secao} className="card">
                  <header className={styles.secaoHeader}>
                    <h3>{secao}</h3>
                    <span className={styles.count}>
                      {list.length} máquina(s)
                    </span>
                  </header>

                  <ul className={styles.maquinasGrid}>
                    {list.map((m) => (
                      <li
                        key={m.id}
                        className={`${styles.item} ${
                          styles[m.__ui] || styles[m.status]
                        }`}
                      >
                        <div className={styles.itemTop}>
                          <span className={styles.codigo}>{m.codigo}</span>
                          {statusBadge(m.__ui)}
                        </div>
                        <div className={styles.itemBottom}>
                          <span className={styles.nome}>{m.nome}</span>
                          <div className={styles.itemActions}>
                            {canEdit && (
                              <button
                                className={styles.editBtn}
                                onClick={() =>
                                  setForm({
                                    id: m.id,
                                    codigo: m.codigo,
                                    nome: m.nome,
                                    status: m.status,
                                    secaoId: m.secao?.id || "",
                                  })
                                }
                                title="Editar máquina"
                              >
                                <Pencil />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className={styles.deleteBtn}
                                onClick={() =>
                                  setConfirm({ id: m.id, nome: m.nome })
                                }
                                title="Excluir máquina"
                              >
                                <Trash2 />
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>

        {/* Confirmação de exclusão */}
        {confirm && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <h2>Excluir máquina?</h2>
              <p>Tem certeza que deseja excluir a máquina "{confirm.nome}"?</p>
              <div className={styles.modalActions}>
                <button
                  className={styles.dangerBtn}
                  onClick={() => onDelete(confirm.id)}
                  disabled={!canDelete}
                  title={
                    canDelete ? "Excluir agora" : "Sem permissão para excluir"
                  }
                >
                  Excluir
                </button>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setConfirm(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
