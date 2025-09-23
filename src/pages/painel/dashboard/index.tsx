// src/pages/painel/index.tsx
import useSWR, { mutate as globalMutate } from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { useEffect, useMemo, useState } from "react";
import {
  Play,
  Pause,
  RefreshCw,
  Columns2,
  List,
  Filter,
  Calendar,
  X,
  Search,
  Pencil,
  CheckCircle2,
  Undo2,
  Save,
  CheckCircle,
  Activity,
  Clock3,
  Factory,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";

type Secao = { id: string; nome: string | null };
type Maquina = {
  id: string;
  codigo: string;
  nome: string;
  status: "ATIVA" | "PARADA" | "MANUTENCAO";
  secao: Secao | null;
};
type Parada = {
  id: string;
  motivo: string;
  horaInicio: string;
  horaFinalizacao?: string | null;
  equipeAtuando?: string | null;
  observacao?: string | null;
  maquina?: { id: string; nome: string; codigo: string } | null;
};
type Evento = {
  id: string;
  type: "PARADA_ABERTA" | "PARADA_FINALIZADA" | "STATUS_ALTERADO";
  at: string;
  maquinaCodigo: string;
  maquinaNome: string;
  detalhe?: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MonitorPainel() {
  /* =================== AUTO-REFRESH / DADOS PRINCIPAIS =================== */
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshInterval = autoRefresh ? 8000 : 0;

  const {
    data,
    mutate: refetchMaquinas,
    isLoading,
  } = useSWR<{ data: Maquina[] }>("/api/painel/maquinas", fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
  });

  const maquinas = data?.data ?? [];

  /* =================== KPIs GERAIS =================== */
  const totais = useMemo(() => {
    const total = maquinas.length;
    const ativas = maquinas.filter((m) => m.status === "ATIVA").length;
    const paradas = maquinas.filter((m) => m.status === "PARADA").length;
    const manut = maquinas.filter((m) => m.status === "MANUTENCAO").length;
    return { total, ativas, paradas, manut };
  }, [maquinas]);

  /* =================== CONTADOR POR SEÇÃO =================== */
  const porSecao = useMemo(() => {
    const map = new Map<
      string,
      { total: number; ativas: number; paradas: number; manut: number }
    >();
    for (const m of maquinas) {
      const k = m.secao?.nome ?? "Sem seção";
      const cur = map.get(k) || { total: 0, ativas: 0, paradas: 0, manut: 0 };
      cur.total++;
      if (m.status === "ATIVA") cur.ativas++;
      else if (m.status === "PARADA") cur.paradas++;
      else cur.manut++;
      map.set(k, cur);
    }
    return Array.from(map.entries())
      .map(([secao, counters]) => ({ secao, ...counters }))
      .sort((a, b) => a.secao.localeCompare(b.secao));
  }, [maquinas]);

  const secoesLista = useMemo(() => {
    const names = new Set<string>();
    maquinas.forEach((m) => names.add(m.secao?.nome ?? "Sem seção"));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [maquinas]);

  /* =================== BUSCA / FILTROS (LISTA) =================== */
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "TODAS" | "ATIVA" | "PARADA" | "MANUTENCAO"
  >("TODAS");
  const [secaoFilter, setSecaoFilter] = useState<string>("TODAS"); // <- novo
  const [groupBySecao, setGroupBySecao] = useState<boolean>(false); // <- novo

  const filtradas = useMemo(() => {
    const t = (q || "").toLowerCase().trim();
    return maquinas.filter((m) => {
      const byStatus =
        statusFilter === "TODAS" ? true : m.status === statusFilter;

      const secaoNome = m.secao?.nome ?? "Sem seção";
      const bySecao =
        secaoFilter === "TODAS" ? true : secaoNome === secaoFilter;

      const byText =
        !t ||
        (m.nome || "").toLowerCase().includes(t) ||
        (m.codigo || "").toLowerCase().includes(t) ||
        (secaoNome || "").toLowerCase().includes(t);

      return byStatus && bySecao && byText;
    });
  }, [maquinas, q, statusFilter, secaoFilter]);

  /* =================== VISUAL (GRID/LISTA) =================== */
  const [view, setView] = useState<"grid" | "list">("grid");

  /* =================== TICKER DE EVENTOS (opcional) =================== */
  const { data: eventosRes } = useSWR<{ ok: boolean; data: Evento[] }>(
    "/api/painel/eventos?limit=25",
    fetcher,
    { refreshInterval: autoRefresh ? 12000 : 0, revalidateOnFocus: false }
  );
  const eventos = eventosRes?.data ?? [];

  /* =================== MODAL HISTÓRICO POR MÁQUINA =================== */
  const [selected, setSelected] = useState<Maquina | null>(null);

  const [histStatus, setHistStatus] = useState<
    "TODAS" | "ATIVA" | "FINALIZADA"
  >("TODAS");
  const [inicioDe, setInicioDe] = useState<string>("");
  const [inicioAte, setInicioAte] = useState<string>("");

  const histUrl = selected
    ? `/api/maquinas/${selected.id}/paradas?status=${histStatus}${
        inicioDe ? `&inicioDe=${encodeURIComponent(inicioDe)}` : ""
      }${inicioAte ? `&inicioAte=${encodeURIComponent(inicioAte)}` : ""}`
    : null;

  const { data: histRes, mutate: refetchHist } = useSWR<{
    ok: boolean;
    data: Parada[];
  }>(histUrl, fetcher, { revalidateOnFocus: false });
  const historico = histRes?.data ?? [];

  /* =================== MODAL EDIÇÃO DE PARADA (reuso) =================== */
  const [editingId, setEditingId] = useState<string | null>(null);
  const paradaEndpoint = editingId ? `/api/paradas/${editingId}` : null;
  const { data: paradaSel, mutate: refetchParada } = useSWR<{
    ok: boolean;
    data: Parada;
  }>(paradaEndpoint, fetcher);
  const [editForm, setEditForm] = useState({
    motivo: "",
    equipeAtuando: "",
    observacao: "",
  });

  useEffect(() => {
    if (!editingId) return;
    const p = historico.find((x) => x.id === editingId);
    if (p) {
      setEditForm({
        motivo: p.motivo || "",
        equipeAtuando: p.equipeAtuando || "",
        observacao: p.observacao || "",
      });
    }
  }, [editingId]); // eslint-disable-line

  async function salvarEdicao() {
    if (!editingId) return;
    await fetch(`/api/paradas/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    await Promise.all([refetchParada(), refetchHist()]);
    setEditingId(null);
    showToast("Parada atualizada.");
  }
  async function finalizarAgora() {
    if (!editingId) return;
    await fetch(`/api/paradas/${editingId}/finalizar`, { method: "POST" });
    await Promise.all([
      refetchParada(),
      refetchHist(),
      globalMutate("/api/painel/maquinas"),
    ]);
    setEditingId(null);
    showToast("Parada finalizada.");
  }
  async function desfazerFinalizacao() {
    if (!editingId) return;
    await fetch(`/api/paradas/${editingId}/reabrir`, { method: "POST" });
    await Promise.all([
      refetchParada(),
      refetchHist(),
      globalMutate("/api/painel/maquinas"),
    ]);
    setEditingId(null);
    showToast("Finalização desfeita.");
  }

  /* =================== HELPERS UI =================== */
  function badgeClass(st: Maquina["status"]) {
    return `${styles.badge} ${
      st === "ATIVA"
        ? styles.badgeOn
        : st === "PARADA"
        ? styles.badgeOff
        : styles.badgeMaint
    }`;
  }
  function fmtData(d: string | Date) {
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleString();
  }
  function fmtDuracao(iniIso: string, fimIso?: string | null) {
    const start = new Date(iniIso).getTime();
    const end = fimIso ? new Date(fimIso).getTime() : Date.now();
    const secs = Math.max(0, Math.floor((end - start) / 1000));
    const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
    const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  /* =================== TOAST =================== */
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  /* =================== AGRUPAMENTO para render =================== */
  const gruposFiltrados = useMemo(() => {
    // Agrupa somente o conjunto já filtrado
    const map = new Map<string, Maquina[]>();
    for (const m of filtradas) {
      const k = m.secao?.nome ?? "Sem seção";
      (map.get(k) || map.set(k, []).get(k)!)?.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtradas]);

  /* =================== RENDER =================== */
  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <div className={styles.titleWrap}>
          <h1 className={styles.title}>Monitor de Máquinas</h1>
          <span className={styles.hint}>
            Status em tempo real, histórico e indicadores.
          </span>
        </div>

        <div className={styles.actionsRight}>
          {/* Busca + Status */}
          <div className={styles.inputGroup}>
            <input
              className={styles.input}
              placeholder="Buscar: nome, código ou seção…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Filter size={14} />
            <select
              className={styles.input}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="TODAS">Todas</option>
              <option value="ATIVA">Funcionando</option>
              <option value="PARADA">Parada</option>
              <option value="MANUTENCAO">Manutenção</option>
            </select>
          </div>

          {/* NOVO: Filtro por Seção */}
          <div className={styles.inputGroup}>
            <Factory size={14} />
            <select
              className={styles.input}
              value={secaoFilter}
              onChange={(e) => setSecaoFilter(e.target.value)}
              title="Filtrar por seção"
            >
              <option value="TODAS">Todas as seções</option>
              {secoesLista.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.btnGroup}>
            {/* NOVO: Toggle separar por seção (apenas afeta visual grid) */}
            <button
              className={styles.ghostBtn}
              onClick={() => setGroupBySecao((v) => !v)}
              title={
                groupBySecao ? "Desagrupar por seção" : "Separar por seção"
              }
            >
              <LayoutGrid size={16} />
              {groupBySecao ? "Sem grupos" : "Por seção"}
            </button>

            <button
              className={styles.ghostBtn}
              onClick={() => setAutoRefresh((v) => !v)}
              title={autoRefresh ? "Pausar atualização" : "Retomar atualização"}
            >
              {autoRefresh ? <Pause size={16} /> : <Play size={16} />}
              {autoRefresh ? "Pausar" : "Retomar"}
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => refetchMaquinas()}
            >
              <RefreshCw size={16} />
              Atualizar
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
            >
              {view === "grid" ? <List size={16} /> : <Columns2 size={16} />}
              {view === "grid" ? "Lista" : "Cartões"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI RÁPIDOS */}
      <section className={styles.kpis} aria-live="polite">
        <div className={`card ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Total</span>
          <strong className={styles.kpiValue}>{totais.total}</strong>
          <span className={styles.kpiHint}>
            <Factory size={12} /> Máquinas
          </span>
        </div>
        <div className={`card ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Funcionando</span>
          <strong className={`${styles.kpiValue} ${styles.good}`}>
            {totais.ativas}
          </strong>
          <span className={styles.kpiHint}>ATIVA</span>
        </div>
        <div className={`card ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Paradas</span>
          <strong className={`${styles.kpiValue} ${styles.bad}`}>
            {totais.paradas}
          </strong>
          <span className={styles.kpiHint}>PARADA</span>
        </div>
        <div className={`card ${styles.kpi}`}>
          <span className={styles.kpiLabel}>Manutenção</span>
          <strong className={`${styles.kpiValue} ${styles.warn}`}>
            {totais.manut}
          </strong>
          <span className={styles.kpiHint}>MANUTENÇÃO</span>
        </div>
      </section>

      {/* CONTADORES POR SEÇÃO */}
      <section className={`card ${styles.sectionCounters}`}>
        <header className={styles.cardHead}>
          <h3>Seções</h3>
        </header>
        <div className={styles.sectionChips}>
          {porSecao.map((s) => (
            <div key={s.secao} className={styles.sectionChip}>
              <strong>{s.secao}</strong>
              <span className={styles.sep} />
              <span className={styles.smallBadge}>Total {s.total}</span>
              <span className={`${styles.smallBadge} ${styles.good}`}>
                Ativas {s.ativas}
              </span>
              <span className={`${styles.smallBadge} ${styles.bad}`}>
                Paradas {s.paradas}
              </span>
              <span className={`${styles.smallBadge} ${styles.warn}`}>
                Manut {s.manut}
              </span>
            </div>
          ))}
          {porSecao.length === 0 && (
            <div className={styles.dim}>Sem seções.</div>
          )}
        </div>
      </section>

      {/* TICKER DE EVENTOS */}
      {eventos.length > 0 && (
        <section className={`card ${styles.ticker}`}>
          <header className={styles.cardHead}>
            <h3>Eventos recentes</h3>
            <span className={styles.dimSmall}>
              Atualiza a cada {autoRefresh ? "12s" : "pausado"}
            </span>
          </header>
          <ul className={styles.tickerList}>
            {eventos.map((ev) => (
              <li key={ev.id} className={styles.tickerItem}>
                <Activity size={14} />
                <span className={styles.mono}>
                  {new Date(ev.at).toLocaleTimeString()}
                </span>
                <span className={styles.dot} />
                <strong>{ev.maquinaCodigo}</strong>
                <span className={styles.dimSmall}>— {ev.maquinaNome}</span>
                <span className={styles.dot} />
                <span>
                  {ev.type === "PARADA_ABERTA"
                    ? "Parada aberta"
                    : ev.type === "PARADA_FINALIZADA"
                    ? "Parada finalizada"
                    : "Status alterado"}
                </span>
                {ev.detalhe ? (
                  <em className={styles.dimSmall}> — {ev.detalhe}</em>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* LISTAGEM PRINCIPAL */}
      {view === "grid" ? (
        groupBySecao ? (
          // AGRUPADO POR SEÇÃO
          <div className={styles.groupWrap}>
            {gruposFiltrados.map(([secao, lista]) => (
              <section key={secao} className={`card ${styles.groupSection}`}>
                <header className={styles.groupHeader}>
                  <h3>{secao}</h3>
                  <span className={styles.dimSmall}>
                    {lista.length} máquina(s)
                  </span>
                </header>
                <div className={styles.groupGrid}>
                  {lista.map((m) => (
                    <div
                      key={m.id}
                      className={`card ${styles.cardItem}`}
                      onClick={() => setSelected(m)}
                    >
                      <div className={styles.itemTop}>
                        <span className={styles.codigo}>{m.codigo}</span>
                        <span className={badgeClass(m.status)}>
                          {m.status === "ATIVA"
                            ? "FUNCIONANDO"
                            : m.status === "PARADA"
                            ? "PARADA"
                            : "MANUTENÇÃO"}
                        </span>
                      </div>
                      <div className={styles.itemBottom}>
                        <span className={styles.nome}>{m.nome}</span>
                        <span className={styles.dim}>
                          {m.secao?.nome || "Sem seção"}
                        </span>
                      </div>
                      <div className={styles.itemActions}>
                        <Link
                          href={`/operacao?maquinaId=${m.id}`}
                          className={styles.smallLinkBtn}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Search size={14} /> Operação
                        </Link>
                        <Link
                          href={`/paradas/novo?maquinaId=${m.id}`}
                          className={styles.smallLinkBtn}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Clock3 size={14} /> Nova parada
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {gruposFiltrados.length === 0 && (
              <div className={`card ${styles.empty}`}>
                {isLoading ? "Carregando…" : "Nenhuma máquina encontrada."}
              </div>
            )}
          </div>
        ) : (
          // SEM AGRUPAMENTO
          <div className={styles.sectionsGrid}>
            {(filtradas.length ? filtradas : []).map((m) => (
              <div
                key={m.id}
                className={`card ${styles.cardItem}`}
                onClick={() => setSelected(m)}
              >
                <div className={styles.itemTop}>
                  <span className={styles.codigo}>{m.codigo}</span>
                  <span className={badgeClass(m.status)}>
                    {m.status === "ATIVA"
                      ? "FUNCIONANDO"
                      : m.status === "PARADA"
                      ? "PARADA"
                      : "MANUTENÇÃO"}
                  </span>
                </div>
                <div className={styles.itemBottom}>
                  <span className={styles.nome}>{m.nome}</span>
                  <span className={styles.dim}>
                    {m.secao?.nome || "Sem seção"}
                  </span>
                </div>

                <div className={styles.itemActions}>
                  <Link
                    href={`/operacao?maquinaId=${m.id}`}
                    className={styles.smallLinkBtn}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Search size={14} /> Operação
                  </Link>
                  <Link
                    href={`/paradas/novo?maquinaId=${m.id}`}
                    className={styles.smallLinkBtn}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Clock3 size={14} /> Nova parada
                  </Link>
                </div>
              </div>
            ))}
            {filtradas.length === 0 && (
              <div className={`card ${styles.empty}`}>
                {isLoading ? "Carregando…" : "Nenhuma máquina encontrada."}
              </div>
            )}
          </div>
        )
      ) : (
        // LISTA (tabela)
        <div className="card">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Máquina</th>
                  <th>Seção</th>
                  <th>Status</th>
                  <th style={{ width: 220 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((m) => (
                  <tr key={m.id}>
                    <td className={styles.mono}>{m.codigo}</td>
                    <td>{m.nome}</td>
                    <td>{m.secao?.nome || "—"}</td>
                    <td>
                      <span className={badgeClass(m.status)}>
                        {m.status === "ATIVA"
                          ? "FUNCIONANDO"
                          : m.status === "PARADA"
                          ? "PARADA"
                          : "MANUTENÇÃO"}
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          className={styles.smallBtn}
                          onClick={() => setSelected(m)}
                        >
                          Histórico
                        </button>
                        <Link
                          href={`/operacao?maquinaId=${m.id}`}
                          className={styles.smallBtn}
                        >
                          Operação
                        </Link>
                        <Link
                          href={`/paradas/novo?maquinaId=${m.id}`}
                          className={styles.smallBtn}
                        >
                          Nova parada
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={5} className={styles.empty}>
                      {isLoading
                        ? "Carregando…"
                        : "Nenhuma máquina encontrada."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={styles.toast} role="status" aria-live="polite">
          <CheckCircle size={16} />
          {toast}
        </div>
      )}

      {/* MODAL: HISTÓRICO DA MÁQUINA */}
      {selected && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setSelected(null)}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="histTitle"
          >
            <div className={styles.modalCard}>
              <header className={styles.modalHeader}>
                <div className={styles.modalTitleWrap}>
                  <Search size={16} />
                  <h4 id="histTitle" className={styles.modalTitle}>
                    Histórico — {selected.nome}{" "}
                    <span className={styles.dim}>({selected.codigo})</span>
                  </h4>
                </div>
                <button
                  className={styles.closeBtn}
                  onClick={() => setSelected(null)}
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </header>

              {/* Filtros do histórico */}
              <div className={styles.filters}>
                <div className={styles.filterItem}>
                  <Filter size={14} />
                  <select
                    className={styles.input}
                    value={histStatus}
                    onChange={(e) => setHistStatus(e.target.value as any)}
                  >
                    <option value="TODAS">Todas</option>
                    <option value="ATIVA">Em andamento</option>
                    <option value="FINALIZADA">Finalizadas</option>
                  </select>
                </div>
                <div className={styles.filterItem}>
                  <Calendar size={14} />
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={inicioDe}
                    onChange={(e) => setInicioDe(e.target.value)}
                  />
                </div>
                <div className={styles.filterItem}>
                  <Calendar size={14} />
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={inicioAte}
                    onChange={(e) => setInicioAte(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => {
                    setHistStatus("TODAS");
                    setInicioDe("");
                    setInicioAte("");
                    refetchHist();
                  }}
                  title="Limpar filtros"
                >
                  Limpar
                </button>
              </div>

              {/* Tabela histórico */}
              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.fixedTable}`}>
                  <thead>
                    <tr>
                      <th>Motivo</th>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Duração</th>
                      <th className={styles.hideSm}>Equipe</th> {/* <- add */}
                      <th className={styles.hideSm}>Observação</th>{" "}
                      {/* <- add */}
                      <th>Status</th>
                      <th style={{ width: 180 }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((p) => {
                      const ativa = !p.horaFinalizacao;
                      return (
                        <tr key={p.id}>
                          <td className={styles.ellipsisCell} title={p.motivo}>
                            {p.motivo}
                          </td>
                          <td>{fmtData(p.horaInicio)}</td>
                          <td>
                            {p.horaFinalizacao
                              ? fmtData(p.horaFinalizacao)
                              : "—"}
                          </td>
                          <td className={styles.mono}>
                            {fmtDuracao(
                              p.horaInicio,
                              p.horaFinalizacao || undefined
                            )}
                          </td>

                          {/* essas duas somem no mobile */}
                          <td
                            className={`${styles.ellipsisCell} ${styles.hideSm}`}
                            title={p.equipeAtuando || ""}
                          >
                            {p.equipeAtuando || "—"}
                          </td>
                          <td
                            className={`${styles.ellipsisCell} ${styles.hideSm}`}
                            title={p.observacao || ""}
                          >
                            {p.observacao || "—"}
                          </td>

                          <td>
                            <span
                              className={`${styles.badge} ${
                                ativa ? styles.badgeOff : styles.badgeOn
                              }`}
                            >
                              {ativa ? "Em andamento" : "Finalizada"}
                            </span>
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <button
                                className={styles.smallBtnE}
                                onClick={() => setEditingId(p.id)}
                                title="Editar"
                              >
                                <Pencil size={14} /> Editar
                              </button>
                              {!p.horaFinalizacao ? (
                                <button
                                  className={styles.smallBtnF}
                                  onClick={() => {
                                    setEditingId(p.id);
                                    finalizarAgora();
                                  }}
                                  title="Finalizar agora"
                                >
                                  <CheckCircle2 size={14} /> Finalizar
                                </button>
                              ) : (
                                <button
                                  className={styles.smallBtnR}
                                  onClick={() => {
                                    setEditingId(p.id);
                                    desfazerFinalizacao();
                                  }}
                                  title="Reabrir"
                                >
                                  <Undo2 size={14} /> Reabrir
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {historico.length === 0 && (
                      <tr>
                        <td colSpan={8} className={styles.empty}>
                          Sem registros para os filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <footer className={styles.modalFooter}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setSelected(null)}
                >
                  Fechar
                </button>
              </footer>
            </div>
          </div>
        </>
      )}

      {/* MODAL: EDIÇÃO PARADA */}
      {editingId && paradaSel?.data && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setEditingId(null)}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="editTitle"
          >
            <div className={styles.modalCard}>
              <header className={styles.modalHeader}>
                <div className={styles.modalTitleWrap}>
                  <Pencil size={16} />
                  <h4 id="editTitle" className={styles.modalTitle}>
                    Editar Parada
                  </h4>
                </div>
                <button
                  className={styles.closeBtn}
                  onClick={() => setEditingId(null)}
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </header>

              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.label}>Máquina</label>
                  <div className={styles.staticField}>
                    {paradaSel.data.maquina?.nome}{" "}
                    <span className={styles.dim}>
                      ({paradaSel.data.maquina?.codigo})
                    </span>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Motivo</label>
                  <input
                    className={styles.inputBox}
                    value={editForm.motivo}
                    onChange={(e) =>
                      setEditForm((s) => ({ ...s, motivo: e.target.value }))
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Equipe</label>
                  <input
                    className={styles.inputBox}
                    value={editForm.equipeAtuando}
                    onChange={(e) =>
                      setEditForm((s) => ({
                        ...s,
                        equipeAtuando: e.target.value,
                      }))
                    }
                    placeholder="Elétrica / Mecânica…"
                  />
                </div>

                <div className={styles.fieldFull}>
                  <label className={styles.label}>Observação</label>
                  <textarea
                    className={styles.textarea}
                    rows={5}
                    value={editForm.observacao}
                    onChange={(e) =>
                      setEditForm((s) => ({ ...s, observacao: e.target.value }))
                    }
                    placeholder="Detalhes adicionais"
                  />
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setEditingId(null)}
                >
                  Cancelar
                </button>
                <button className={styles.primaryBtn} onClick={salvarEdicao}>
                  <Save size={16} /> Salvar
                </button>
                {!paradaSel.data.horaFinalizacao ? (
                  <button
                    className={styles.successBtn}
                    onClick={finalizarAgora}
                    title="Finalizar agora"
                  >
                    <CheckCircle2 size={16} /> Finalizar
                  </button>
                ) : (
                  <button
                    className={styles.warnBtn}
                    onClick={desfazerFinalizacao}
                    title="Desfazer finalização"
                  >
                    <Undo2 size={16} /> Reabrir
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
