// src/pages/operacao/index.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import useSWR, { mutate as globalMutate } from "swr";
import { useEffect, useMemo, useState } from "react";
import {
  PlayCircle,
  StopCircle,
  Factory,
  Search,
  Clock,
  AlertTriangle,
  Check,
  X,
  BadgeCheck,
  Filter as FilterIcon,
  History,
  Tag,
} from "lucide-react";
import { useRouter } from "next/router";

// ===== Permissões =====
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function useTicker(ms: number) {
  const [, setT] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setT((v) => v + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/** ===== Tipos e Categorias de Parada (tipados) ===== */
export type ParadaTipo = "OPERACIONAL" | "NAO_OPERACIONAL";

export type ParadaCategoria =
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

const CATEGORIAS_OPERACIONAIS: { key: ParadaCategoria; label: string }[] = [
  { key: "MANUTENCAO_CORRETIVA", label: "Manut. Corretiva" },
  { key: "MANUTENCAO_PREVENTIVA", label: "Manut. Preventiva" },
  { key: "SETUP_TROCA_FERRAMENTA", label: "Setup/Troca Ferr." },
  { key: "FALTA_MATERIAL", label: "Falta Mat." },
  { key: "QUALIDADE_INSPECAO", label: "Qualid./Insp." },
  { key: "AJUSTE_PROCESSO", label: "Ajuste de Proc." },
  { key: "ABASTECIMENTO", label: "Abastec." },
  { key: "LIMPEZA", label: "Limpeza" },
];

const CATEGORIAS_NAO_OPERACIONAIS: {
  key: ParadaCategoria;
  label: string;
}[] = [
  { key: "ALMOCO", label: "Almoço" },
  { key: "BANHEIRO", label: "Banheiro" },
  { key: "REUNIAO", label: "Reunião" },
  { key: "TREINAMENTO", label: "Treinam." },
  { key: "DDS", label: "DDS" },
  { key: "OUTROS_NAO_OPERACIONAL", label: "Outros (N/Op.)" },
];

function labelCategoria(cat?: ParadaCategoria | null): string {
  if (!cat) return "-";
  const all = [...CATEGORIAS_OPERACIONAIS, ...CATEGORIAS_NAO_OPERACIONAIS];
  return (
    all.find((c) => c.key === cat)?.label ?? String(cat).replace(/_/g, " ")
  );
}

/** ===== Tipos retornados pela API ===== */
type Maquina = {
  id: string;
  codigo: string;
  nome: string;
  status: "ATIVA" | "PARADA" | "MANUTENCAO";
};

type Parada = {
  id: string;
  horaInicio: string; // ISO
  motivo: string;
  equipeAtuando?: string | null;
  observacao?: string | null;
  tipo?: ParadaTipo | null; // pode vir undefined em dados antigos
  categoria?: ParadaCategoria | null; // idem
  maquina?: Maquina;
};

type ParadaFinalizada = {
  id: string;
  horaInicio: string; // ISO
  horaFinalizacao: string; // ISO
  motivo: string;
  tipo?: ParadaTipo | null;
  categoria?: ParadaCategoria | null;
  maquina?: Maquina;
};

export default function Operacao() {
  const router = useRouter();
  const queryMachineId =
    typeof router.query.maquinaId === "string" ? router.query.maquinaId : "";

  // ===== Sessão / Permissões (módulo: operacao) =====
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (action: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "operacao", action);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canStart = useMemo(() => can("start_parada"), [sess, myRole]);
  const canFinish = useMemo(() => can("finish_parada"), [sess, myRole]);

  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className={`card ${styles.emptyCell}`} role="alert">
          <strong>Sem acesso à Operação.</strong>
        </div>
      </Layout>
    );
  }

  // Tenant atual
  const { data: tenantResp } = useSWR<{
    ok: boolean;
    data: { id: string; name: string } | null;
  }>("/api/tenant/current", fetcher);
  const tenantName =
    tenantResp?.data?.name ?? (tenantResp ? "Todos (agregado)" : "");

  // Dados
  const { data: status, mutate } = useSWR<{ data: Parada[] }>(
    "/api/operacao/status",
    fetcher
  );
  const { data: maq } = useSWR<{ data: Maquina[] }>("/api/maquinas", fetcher);

  /** ===== Formulário ===== */
  const [form, setForm] = useState<{
    maquinaId: string | "";
    tipo: ParadaTipo;
    categoria: ParadaCategoria | "";
    motivo: string;
    equipeAtuando: string;
    observacao: string;
  }>(() => ({
    maquinaId: "",
    tipo: "OPERACIONAL",
    categoria: CATEGORIAS_OPERACIONAIS[0].key,
    motivo: "",
    equipeAtuando: "",
    observacao: "",
  }));

  const [onlySelected, setOnlySelected] = useState<boolean>(!!queryMachineId);

  const histKey =
    onlySelected && form.maquinaId
      ? `/api/operacao/historico?limit=50&maquinaId=${encodeURIComponent(
          form.maquinaId
        )}`
      : "/api/operacao/historico?limit=50";
  const { data: hist } = useSWR<{ data: ParadaFinalizada[] }>(histKey, fetcher);

  useTicker(1000);

  const maquinas = maq?.data ?? [];
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return maquinas;
    return maquinas.filter(
      (m) =>
        m.nome.toLowerCase().includes(s) || m.codigo.toLowerCase().includes(s)
    );
  }, [maquinas, search]);

  const [confirm, setConfirm] = useState<Parada | null>(null); // finalizar
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // >>> NOVO: modal de conflito ao iniciar (ALREADY_OPEN)
  const [openConflict, setOpenConflict] = useState<{
    message: string;
    payload: {
      maquinaId: string;
      tipo: ParadaTipo;
      categoria: ParadaCategoria;
      motivo: string;
      equipeAtuando: string | null;
      observacao: string | null;
    };
  } | null>(null);

  // Ajusta seleção inicial de máquina e sincroniza com query
  useEffect(() => {
    if (queryMachineId && maquinas.length) {
      const exists = maquinas.some((m) => m.id === queryMachineId);
      if (exists) setForm((s) => ({ ...s, maquinaId: queryMachineId }));
    } else if (!form.maquinaId && maquinas.length) {
      setForm((s) => ({ ...s, maquinaId: maquinas[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryMachineId, maquinas]);

  // Troca o conjunto de categorias quando muda o tipo
  useEffect(() => {
    setForm((s) => {
      const list =
        s.tipo === "OPERACIONAL"
          ? CATEGORIAS_OPERACIONAIS
          : CATEGORIAS_NAO_OPERACIONAIS;
      const has = list.find((c) => c.key === s.categoria);
      return has ? s : { ...s, categoria: list[0].key };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tipo]);

  async function startParada(e: React.FormEvent) {
    e.preventDefault();

    if (!canStart) {
      setFlash("Sem permissão para iniciar parada.");
      setTimeout(() => setFlash(null), 2200);
      return;
    }
    if (!form.maquinaId || !form.motivo.trim() || !form.categoria || submitting)
      return;

    const payload = {
      maquinaId: form.maquinaId,
      tipo: form.tipo,
      categoria: form.categoria as ParadaCategoria, // <- mantém tipagem correta
      motivo: form.motivo.trim(),
      equipeAtuando: form.equipeAtuando.trim() || null,
      observacao: form.observacao.trim() || null,
    };

    setSubmitting(true);
    const r = await fetch("/api/operacao/paradas/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const js: any = await r.json().catch(() => ({}));
    setSubmitting(false);

    // === Conflito: já existe parada aberta -> abre a MODAL e LIMPA OS CAMPOS ===
    if (r.status === 409 || js?.code === "ALREADY_OPEN") {
      setOpenConflict({
        message:
          js?.error ||
          "Já existe uma parada em aberto para esta máquina. Deseja abrir outra?",
        payload, // a sua modal já usa isso para reenviar com ignoreOpen
      });

      // 🔹 limpa os campos imediatamente (mantendo máquina/tipo/categoria)
      setForm((s) => ({
        ...s,
        motivo: "",
        equipeAtuando: "",
        observacao: "",
      }));
      return;
    }

    // === Sucesso (sem conflito) ===
    if (js?.ok) {
      // limpa os campos no sucesso também
      setForm((s) => ({ ...s, motivo: "", equipeAtuando: "", observacao: "" }));

      const m = (maq?.data ?? []).find((x) => x.id === form.maquinaId);
      setFlash(
        `Parada iniciada: ${m?.nome ?? "Máquina"} (${
          m?.codigo
        }) — ${labelCategoria(form.categoria as ParadaCategoria)}`
      );

      mutate().then(() => {
        if (js.data?.id) {
          setHighlightId(js.data.id);
          setTimeout(() => setHighlightId(null), 3500);
        }
      });
      globalMutate("/api/maquinas");
      setTimeout(() => setFlash(null), 3500);
      return;
    }

    // === Falha genérica ===
    setFlash(js?.error || "Não foi possível iniciar a parada.");
    setTimeout(() => setFlash(null), 2500);
  }

  // Confirma abrir mesmo com parada já em aberto
  async function confirmStartAnyway() {
    if (!openConflict) return;
    setSubmitting(true);
    const r2 = await fetch("/api/operacao/paradas/start?ignoreOpen=1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...openConflict.payload, ignoreOpen: true }),
    });
    const js2 = await r2.json().catch(() => ({}));
    setSubmitting(false);
    setOpenConflict(null);

    if (js2?.ok) {
      const m = maquinas.find((x) => x.id === openConflict.payload.maquinaId);
      setFlash(
        `Parada adicional iniciada: ${m?.nome ?? "Máquina"} (${
          m?.codigo
        }) — ${labelCategoria(openConflict.payload.categoria)}`
      );
      mutate().then(() => {
        if (js2.data?.id) {
          setHighlightId(js2.data.id);
          setTimeout(() => setHighlightId(null), 3500);
        }
      });
      globalMutate("/api/maquinas");
      setTimeout(() => setFlash(null), 3500);
    } else {
      setFlash(js2?.error || "Falha ao iniciar nova parada.");
      setTimeout(() => setFlash(null), 2500);
    }
  }

  async function finalizarParada(id: string) {
    if (!canFinish) {
      setFlash("Sem permissão para finalizar parada.");
      setTimeout(() => setFlash(null), 2200);
      return;
    }
    const r = await fetch(`/api/operacao/paradas/${id}/finalizar`, {
      method: "POST",
    });
    const js = await r.json().catch(() => ({}));
    setConfirm(null);
    if (js?.ok) {
      mutate();
      globalMutate("/api/maquinas");
      globalMutate(histKey);
      setFlash("Parada finalizada com sucesso.");
      setTimeout(() => setFlash(null), 2500);
    } else {
      setFlash(js?.error || "Falha ao finalizar parada.");
      setTimeout(() => setFlash(null), 2500);
    }
  }

  function fmtDuracao(startIso: string) {
    const startT = new Date(startIso).getTime();
    if (Number.isNaN(startT)) return "--:--:--";
    const secs = Math.max(0, Math.floor((Date.now() - startT) / 1000));
    const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function fmtDuracaoRange(startIso: string, endIso: string) {
    const startT = new Date(startIso).getTime();
    const endT = new Date(endIso).getTime();
    if (Number.isNaN(startT) || Number.isNaN(endT)) return "--:--:--";
    const secs = Math.max(0, Math.floor((endT - startT) / 1000));
    const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function badge(st: Maquina["status"]) {
    const map = {
      ATIVA: styles.badgeOn,
      PARADA: styles.badgeOff,
      MANUTENCAO: styles.badgeMaint,
    } as const;
    return <span className={`${styles.badge} ${map[st]}`}>{st}</span>;
  }

  const selectedMachine = maquinas.find((m) => m.id === form.maquinaId);

  const rows = useMemo(() => {
    const base = status?.data ?? [];
    if (onlySelected && form.maquinaId) {
      return base.filter((p) => p.maquina?.id === form.maquinaId);
    }
    return base;
  }, [status?.data, onlySelected, form.maquinaId]);

  const availableCats =
    form.tipo === "OPERACIONAL"
      ? CATEGORIAS_OPERACIONAIS
      : CATEGORIAS_NAO_OPERACIONAIS;

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <div className={styles.titleWrap}>
          <Clock size={18} />
          <h1>Operação</h1>
        </div>
        <span className={styles.hint}>
          Inicie e finalize paradas. Classifique como operacionais ou não
          operacionais.
          {tenantResp && (
            <>
              {" "}
              — <strong>Cliente:</strong> {tenantName}
            </>
          )}
        </span>
      </div>

      {flash && (
        <div className={styles.toastSuccess} role="status" aria-live="polite">
          <BadgeCheck size={16} />
          {flash}
        </div>
      )}

      <div className={styles.grid}>
        {/* Coluna: Seletor + Formulário */}
        <section className={`card ${styles.card}`}>
          <header className={styles.cardHead}>
            <h3>
              <PlayCircle size={16} /> Iniciar nova parada
            </h3>
          </header>

          {/* Picker destacado */}
          <div className={styles.machinePickerAccent}>
            <div className={styles.searchBoxAccent}>
              <Search size={16} />
              <input
                className={styles.searchInputAccent}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar máquinas por nome ou código…"
              />
            </div>

            <div className={styles.machinesListAccent} role="list">
              {filtered.length === 0 ? (
                <div className={styles.emptyList}>
                  <Factory size={18} />
                  Nenhuma máquina encontrada.
                </div>
              ) : (
                filtered.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    role="listitem"
                    className={`${styles.machineItemAccent} ${
                      form.maquinaId === m.id ? styles.selected : ""
                    }`}
                    onClick={() => setForm((s) => ({ ...s, maquinaId: m.id }))}
                    title={`${m.nome} (${m.codigo})`}
                  >
                    <div className={styles.machineTop}>
                      <strong>{m.nome}</strong>
                      {badge(m.status)}
                    </div>
                    <span className={styles.machineCode}>{m.codigo}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Barra de seleção atual */}
          {selectedMachine && (
            <div className={styles.selectionBar}>
              <span className={styles.selectionDot} />
              <div className={styles.selectionText}>
                Máquina selecionada: <strong>{selectedMachine.nome}</strong>{" "}
                <span className={styles.dim}>({selectedMachine.codigo})</span>
              </div>
              {badge(selectedMachine.status)}
            </div>
          )}

          {/* Formulário */}
          <form className={styles.form} onSubmit={startParada}>
            {/* Tipo (segmentado) */}
            <div className={styles.segmented} role="tablist" aria-label="Tipo">
              <button
                type="button"
                role="tab"
                aria-selected={form.tipo === "OPERACIONAL"}
                className={`${styles.segBtn} ${
                  form.tipo === "OPERACIONAL" ? styles.segActive : ""
                }`}
                onClick={() =>
                  setForm((s) => ({
                    ...s,
                    tipo: "OPERACIONAL",
                  }))
                }
                disabled={!canStart}
              >
                Operacional
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={form.tipo === "NAO_OPERACIONAL"}
                className={`${styles.segBtn} ${
                  form.tipo === "NAO_OPERACIONAL" ? styles.segActive : ""
                }`}
                onClick={() =>
                  setForm((s) => ({
                    ...s,
                    tipo: "NAO_OPERACIONAL",
                  }))
                }
                disabled={!canStart}
              >
                Não Operacional
              </button>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.label}>Máquina</label>
                <select
                  className={styles.input}
                  value={form.maquinaId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, maquinaId: e.target.value }))
                  }
                >
                  {maquinas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} ({m.codigo})
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.col}>
                <label className={styles.label}>
                  <span className={styles.inlineIcon}>
                    <Tag size={14} />
                  </span>
                  Categoria
                </label>
                <select
                  className={styles.input}
                  value={form.categoria}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      categoria: e.target.value as ParadaCategoria,
                    }))
                  }
                >
                  {(form.tipo === "OPERACIONAL"
                    ? CATEGORIAS_OPERACIONAIS
                    : CATEGORIAS_NAO_OPERACIONAIS
                  ).map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.label}>Motivo (texto livre)</label>
                <input
                  className={styles.input}
                  value={form.motivo}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, motivo: e.target.value }))
                  }
                  placeholder="Ex.: Falha elétrica"
                  required
                />
              </div>
              <div className={styles.col}>
                <label className={styles.label}>Equipe</label>
                <input
                  className={styles.input}
                  value={form.equipeAtuando}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, equipeAtuando: e.target.value }))
                  }
                  placeholder="Elétrica / Mecânica… (opcional)"
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.label}>Observação</label>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  value={form.observacao}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, observacao: e.target.value }))
                  }
                  placeholder="Detalhes da ocorrência (opcional)"
                  rows={4}
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.primaryBtn}
                type="submit"
                disabled={
                  !canStart ||
                  !form.maquinaId ||
                  !form.motivo.trim() ||
                  !form.categoria ||
                  submitting
                }
                aria-disabled={!canStart}
                title={
                  canStart
                    ? "Iniciar parada"
                    : "Sem permissão para iniciar parada"
                }
              >
                <PlayCircle size={16} />
                {submitting ? "Iniciando…" : "Iniciar parada"}
              </button>
            </div>
          </form>
        </section>

        {/* Coluna: Em andamento */}
        <section className={`card ${styles.card}`}>
          <header className={styles.cardHead}>
            <h3>
              <StopCircle size={16} /> Paradas em andamento
            </h3>

            <button
              type="button"
              className={styles.filterChip}
              onClick={() => setOnlySelected((v) => !v)}
              disabled={!form.maquinaId}
              aria-pressed={onlySelected}
              title={
                form.maquinaId
                  ? "Alternar: mostrar apenas desta máquina"
                  : "Selecione uma máquina para filtrar"
              }
            >
              <FilterIcon size={14} />
              {onlySelected ? "Só desta máquina" : "Todas"}
            </button>
          </header>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Motivo</th>
                  <th>Início</th>
                  <th>Duração</th>
                  {canFinish && <th style={{ width: 140 }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    className={highlightId === p.id ? styles.rowHighlight : ""}
                  >
                    <td>
                      {p.maquina?.nome}{" "}
                      <span className={styles.dim}>({p.maquina?.codigo})</span>
                    </td>
                    <td className={styles.kBadge}>
                      {p.tipo === "NAO_OPERACIONAL" ? "Não Oper." : "Oper."}
                    </td>
                    <td className={styles.kBadge}>
                      {labelCategoria(p.categoria)}
                    </td>
                    <td>{p.motivo}</td>
                    <td>{new Date(p.horaInicio).toLocaleString()}</td>
                    <td className={styles.mono}>{fmtDuracao(p.horaInicio)}</td>
                    {canFinish && (
                      <td>
                        <button
                          className={styles.dangerBtn}
                          onClick={() => setConfirm(p)}
                          title="Finalizar parada"
                        >
                          <StopCircle size={14} />
                          Finalizar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={canFinish ? 7 : 6}
                      className={styles.emptyCell}
                    >
                      Nenhuma parada em andamento
                      {onlySelected && selectedMachine
                        ? ` para ${selectedMachine.nome}.`
                        : "."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Coluna: Histórico */}
        <section className={`card ${styles.card}`}>
          <header className={styles.cardHead}>
            <h3>
              <History size={16} /> Histórico de paradas
            </h3>
            <button
              type="button"
              className={styles.filterChip}
              onClick={() => setOnlySelected((v) => !v)}
              disabled={!form.maquinaId}
              aria-pressed={onlySelected}
            >
              <FilterIcon size={14} />
              {onlySelected ? "Só desta máquina" : "Todas"}
            </button>
          </header>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Motivo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th>Duração</th>
                </tr>
              </thead>
              <tbody>
                {(hist?.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.maquina?.nome}{" "}
                      <span className={styles.dim}>({p.maquina?.codigo})</span>
                    </td>
                    <td className={styles.kBadge}>
                      {p.tipo === "NAO_OPERACIONAL" ? "Não Oper." : "Oper."}
                    </td>
                    <td className={styles.kBadge}>
                      {labelCategoria(p.categoria)}
                    </td>
                    <td>{p.motivo}</td>
                    <td>{new Date(p.horaInicio).toLocaleString()}</td>
                    <td>{new Date(p.horaFinalizacao).toLocaleString()}</td>
                    <td className={styles.mono}>
                      {fmtDuracaoRange(p.horaInicio, p.horaFinalizacao)}
                    </td>
                  </tr>
                ))}

                {(!hist?.data || hist.data.length === 0) && (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      Nenhum registro no histórico
                      {onlySelected && selectedMachine
                        ? ` para ${selectedMachine.nome}.`
                        : "."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Modal confirmar finalização */}
      {confirm && canFinish && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setConfirm(null)}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="finalizarTitle"
          >
            <div className={styles.modalCard}>
              <div className={styles.modalIcon}>
                <AlertTriangle size={20} />
              </div>

              <h4 id="finalizarTitle" className={styles.modalTitle}>
                Finalizar parada?
              </h4>

              <p className={styles.modalText}>
                Máquina: <strong>{confirm.maquina?.nome}</strong>{" "}
                <span className={styles.dim}>({confirm.maquina?.codigo})</span>
                <br />
                Tipo:{" "}
                <strong>
                  {confirm.tipo === "NAO_OPERACIONAL"
                    ? "Não Operacional"
                    : "Operacional"}
                </strong>
                <br />
                Categoria: <strong>{labelCategoria(confirm.categoria)}</strong>
                <br />
                Motivo: <strong>{confirm.motivo}</strong>
              </p>

              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setConfirm(null)}
                >
                  <X size={16} />
                  Cancelar
                </button>
                <button
                  className={styles.dangerBtn}
                  onClick={() => finalizarParada(confirm.id)}
                >
                  <Check size={16} />
                  Finalizar agora
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* NOVO: Modal confirmar abrir outra parada com uma já em aberto */}
      {openConflict && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setOpenConflict(null)}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="openAnotherTitle"
          >
            <div className={styles.modalCard}>
              <div className={styles.modalIcon}>
                <AlertTriangle size={20} />
              </div>

              <h4 id="openAnotherTitle" className={styles.modalTitle}>
                Abrir outra parada nesta máquina?
              </h4>

              <p className={styles.modalText}>
                {openConflict.message}
                <br />
                <br />
                <strong>Tipo/Categoria:</strong>{" "}
                {openConflict.payload.tipo === "NAO_OPERACIONAL"
                  ? "Não Operacional"
                  : "Operacional"}{" "}
                — {labelCategoria(openConflict.payload.categoria)}
                <br />
                <strong>Motivo:</strong> {openConflict.payload.motivo}
              </p>

              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setOpenConflict(null)}
                >
                  <X size={16} />
                  Cancelar
                </button>
                <button
                  className={styles.primaryBtn}
                  onClick={confirmStartAnyway}
                  disabled={submitting}
                >
                  <Check size={16} />
                  {submitting ? "Abrindo…" : "Abrir mesmo assim"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
