// src/pages/painel/maquinas/index.tsx
import { useEffect, useMemo, useState, useRef } from "react";
import useSWR from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { FaWhatsapp } from "react-icons/fa";
import { createPortal } from "react-dom";
import {
  Filter,
  X,
  Calendar,
  Search,
  Edit,
  Save,
  CheckCircle2,
  RotateCcw,
  Clock,
  Factory,
  Cog,
  MessageCircle,
  Maximize2,
  Minimize2,
  Eye,
} from "lucide-react";

/* ===== Tipagens ===== */
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
  horaInicio: string; // ISO
  horaFinalizacao?: string | null; // ISO
  equipeAtuando?: string | null;
  observacao?: string | null;
  tipo?: "OPERACIONAL" | "NAO_OPERACIONAL" | null;
  categoria?: string | null;
  maquina?: { id: string; nome: string; codigo: string } | null;
};

type Contato = {
  id: string;
  nome: string;
  celular: string; // E.164 ou somente dígitos conforme banco
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ===== Categorias ===== */
const CATS_OP: ReadonlyArray<string> = [
  "MANUTENCAO_CORRETIVA",
  "MANUTENCAO_PREVENTIVA",
  "SETUP_TROCA_FERRAMENTA",
  "FALTA_MATERIAL",
  "QUALIDADE_INSPECAO",
  "AJUSTE_PROCESSO",
  "ABASTECIMENTO",
  "LIMPEZA",
];

const CATS_NOP: ReadonlyArray<string> = [
  "ALMOCO",
  "BANHEIRO",
  "REUNIAO",
  "TREINAMENTO",
  "DDS",
  "OUTROS_NAO_OPERACIONAL",
];

function labelCategoria(cat?: string | null): string {
  if (!cat) return "-";
  const map: Record<string, string> = {
    MANUTENCAO_CORRETIVA: "Manut. Corretiva",
    MANUTENCAO_PREVENTIVA: "Manut. Preventiva",
    SETUP_TROCA_FERRAMENTA: "Setup/Troca Ferr.",
    FALTA_MATERIAL: "Falta Mat.",
    QUALIDADE_INSPECAO: "Qualid./Insp.",
    AJUSTE_PROCESSO: "Ajuste Proc.",
    ABASTECIMENTO: "Abastec.",
    LIMPEZA: "Limpeza",
    ALMOCO: "Almoço",
    BANHEIRO: "Banheiro",
    REUNIAO: "Reunião",
    TREINAMENTO: "Treinam.",
    DDS: "DDS",
    OUTROS_NAO_OPERACIONAL: "Outros (N/O)",
  };
  return map[cat] ?? cat.replace(/_/g, " ");
}

/* Converte ISO -> "YYYY-MM-DDTHH:MM" (input datetime-local) */
function toInputDateTimeValue(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return (iso as string).slice(0, 16);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/* ===== Helpers de WhatsApp (iguais aos usados em /paradas) ===== */
function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
function toE164BR(input: string) {
  const d = onlyDigits(input);
  if (!d) return "";
  const with55 = d.startsWith("55") ? d : `55${d}`;
  return `+${with55}`;
}
function prettyE164(stored: string) {
  const d = onlyDigits(stored);
  const with55 = d.startsWith("55") ? d : `55${d}`;
  const rest = with55.slice(2);
  const ddd = rest.slice(0, 2);
  const number = rest.slice(2);
  if (!ddd) return "+55";
  if (number.length >= 9)
    return `+55 (${ddd}) ${number.slice(0, 5)}-${number.slice(5, 9)}`;
  return `+55 (${ddd}) ${number.slice(0, 4)}-${number.slice(4, 8)}`;
}
function fmtDataBr(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso!;
  return d.toLocaleString("pt-BR");
}
function fmtDuracaoTexto(iniIso: string, fimIso?: string | null) {
  const start = new Date(iniIso).getTime();
  const end = fimIso ? new Date(fimIso).getTime() : Date.now();
  const secs = Math.max(0, Math.floor((end - start) / 1000));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
function buildParadaText(p: Parada, index: number) {
  const tipo = p.tipo === "NAO_OPERACIONAL" ? "Não Operacional" : "Operacional";
  const categoria = labelCategoria(p.categoria);
  const inicio = fmtDataBr(p.horaInicio);
  const fim = p.horaFinalizacao ? fmtDataBr(p.horaFinalizacao) : "—";
  const dur = fmtDuracaoTexto(p.horaInicio, p.horaFinalizacao);
  const equipe = p.equipeAtuando ? `\n  • *Equipe:* ${p.equipeAtuando}` : "";
  const obs = p.observacao ? `\n  • *Obs:* ${p.observacao}` : "";

  return (
    `*${index + 1}. ${categoria} — ${p.motivo}*\n` +
    `  • *Tipo:* ${tipo}\n` +
    `  • *Início:* ${inicio}\n` +
    `  • *Fim:* ${fim}\n` +
    `  • *Duração:* ${dur}${equipe}${obs}\n` +
    "----------------------------------------------------"
  );
}

function buildMensagemWhatsApp(paradas: Parada[], maquina: Maquina) {
  if (!paradas.length) return "";

  const header =
    `*Relatório de Paradas*\n\n` +
    `*Máquina:* ${maquina.nome} (${maquina.codigo})\n`;

  const body = paradas.map((p, i) => buildParadaText(p, i)).join("\n");

  return `${header}\n${body}`;
}

/* ===== Página ===== */
export default function Painel() {
  /* ===== Data ===== */
  const { data: mData, mutate: mutateMaquinas } = useSWR<{ data: Maquina[] }>(
    "/api/painel/maquinas",
    fetcher,
    { refreshInterval: 5000 }
  );
  const { data: sData } = useSWR<{ data: Secao[] }>("/api/secoes", fetcher);

  // Paradas em aberto para KPIs separados (operacional x não-operacional)
  const { data: pStatus } = useSWR<{
    ok: boolean;
    data: Array<{ tipo?: "OPERACIONAL" | "NAO_OPERACIONAL" }>;
  }>("/api/operacao/status", fetcher, { refreshInterval: 5000 });

  const maquinas = mData?.data ?? [];
  const secoes = (sData?.data ?? []).map((s) => ({
    id: s.id,
    nome: s.nome,
  })) as Secao[];

  /* ===== Totais para KPIs ===== */
  const totais = {
    total: maquinas.length,
    ativas: maquinas.filter((m) => m.status === "ATIVA").length,
  };
  const paradasAbertas = pStatus?.data ?? [];
  const paradasOperacionais = paradasAbertas.filter(
    (p) => p.tipo === "OPERACIONAL"
  ).length;
  const paradasNaoOperacionais = paradasAbertas.filter(
    (p) => p.tipo === "NAO_OPERACIONAL"
  ).length;

  /* ===== Estado UI ===== */
  const [fullscreen, setFullscreen] = useState<boolean>(false); // ← NOVO
  const [selecaoSecao, setSelecaoSecao] = useState<string>("TODAS");
  const [selected, setSelected] = useState<Maquina | null>(null);
  const [status, setStatus] = useState<"TODAS" | "ATIVA" | "FINALIZADA">(
    "TODAS"
  );
  const [inicioDe, setInicioDe] = useState<string>("");
  const [inicioAte, setInicioAte] = useState<string>("");

  // Modal de edição empilhada sobre a de histórico
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editing, setEditing] = useState<Parada | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Modal de confirmação genérico (reuso)
  const [confirm, setConfirm] = useState<{
    open: boolean;
    message: string;
    onYes?: () => void;
  }>({ open: false, message: "" });

  /* ===== Seleção de paradas (para WhatsApp) ===== */
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const selCount = selIds.size;
  //const selCount = useMemo(() => selIds.size, [selIds]);

  const modalRef = useRef<HTMLDivElement | null>(null);

  function toggleSelect(id: string) {
    setSelIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function clearSelection() {
    setSelIds(new Set());
  }
  function selectAll(ids: string[]) {
    setSelIds(new Set(ids));
  }

  /* ===== Modal de envio WhatsApp ===== */
  const [wppOpen, setWppOpen] = useState(false);
  const { data: contatosResp } = useSWR<{ data: Contato[] }>(
    wppOpen ? "/api/contatos" : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const contatos = contatosResp?.data ?? [];

  const [selectedContatoId, setSelectedContatoId] = useState<string>("");
  const [manualNumber, setManualNumber] = useState<string>("");

  function abrirWhatsApp(
    paradas: Parada[],
    maquina: Maquina,
    contato?: Contato,
    numeroManual?: string
  ) {
    if (!paradas.length) return;

    const text = buildMensagemWhatsApp(paradas, maquina);

    // prioridade: número manual > contato do banco > genérico
    const manual = (numeroManual ?? "").trim();
    let target = "";
    if (manual) {
      target = toE164BR(manual); // normaliza para +55...
    } else if (contato?.celular) {
      target = contato.celular; // já armazenado em E.164 ou dígitos
    }

    const num = onlyDigits(target);

    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  /* ===== Agrupamento ===== */
  const grupos = useMemo(() => {
    const g: Record<string, Maquina[]> = {};
    for (const m of maquinas) {
      const key = m.secao?.nome || "Sem seção";
      (g[key] ||= []).push(m);
    }
    for (const key in g)
      g[key].sort((a, b) => a.codigo.localeCompare(b.codigo));
    return g;
  }, [maquinas]);

  /* ===== Utils ===== */
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

  /* ===== Timer no card ===== */
  function ParadaTimer({
    maquinaId,
    status,
  }: {
    maquinaId: string;
    status: "ATIVA" | "PARADA" | "MANUTENCAO";
  }) {
    const ativo = status === "PARADA" || status === "MANUTENCAO";
    const { data } = useSWR<{ ok: boolean; data: Parada[] }>(
      ativo ? `/api/maquinas/${maquinaId}/paradas?status=ATIVA` : null,
      fetcher,
      { revalidateOnFocus: false }
    );
    const aberta = data?.data?.find((p) => !p.horaFinalizacao);
    const [, setNow] = useState<number>(() => Date.now());

    useEffect(() => {
      if (!ativo || !aberta) return;
      const t = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(t);
    }, [ativo, aberta?.id]);

    if (!ativo || !aberta) return null;
    const durHHMMSS = fmtDuracao(aberta.horaInicio, null);
    return (
      <span
        className={`${styles.timer} ${
          status === "MANUTENCAO" ? styles.timerMaint : styles.timerParada
        }`}
        title={durHHMMSS}
      >
        <Clock size={14} strokeWidth={2} />
        <strong>{durHHMMSS}</strong>
      </span>
    );
  }

  function AtivaIndicator() {
    return (
      <span
        className={`${styles.timer} ${styles.timerAtiva}`}
        title="Máquina funcionando"
      >
        <Cog size={14} strokeWidth={2} className={styles.iconActive} />
        <strong>Ativa</strong>
      </span>
    );
  }

  const badgeClass = (st: Maquina["status"]) =>
    `${styles.badge} ${
      st === "ATIVA" ? styles.on : st === "PARADA" ? styles.off : styles.maint
    }`;

  /* ===== Histórico da máquina selecionada ===== */
  const query = selected
    ? `/api/maquinas/${selected.id}/paradas?status=${status}${
        inicioDe ? `&inicioDe=${encodeURIComponent(inicioDe)}` : ""
      }${inicioAte ? `&inicioAte=${encodeURIComponent(inicioAte)}` : ""}`
    : null;

  const { data: hist, mutate: mutateHist } = useSWR<{
    ok: boolean;
    data: Parada[];
  }>(query, fetcher, { refreshInterval: selected ? 5000 : 0 });

  /* ===== Ações edição ===== */
  function openEditModal(parada: Parada) {
    setEditing(parada);
    setEditOpen(true);
  }

  function buildPayload(p: Parada) {
    return {
      ...p,
      horaFinalizacao:
        p.horaFinalizacao && p.horaFinalizacao !== ""
          ? new Date(p.horaFinalizacao).toISOString()
          : null,
    };
  }

  async function saveParada() {
    if (!editing) return;
    try {
      setSaving(true);
      const payload = buildPayload(editing);
      await fetch(`/api/paradas/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await mutateHist();
      await mutateMaquinas();
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function finalizarParada() {
    if (!editing) return;
    try {
      setSaving(true);
      await fetch(`/api/paradas/${editing.id}/finalizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horaFinalizacao: editing.horaFinalizacao ?? new Date().toISOString(),
        }),
      });
      await mutateHist();
      setEditOpen(false);
      await mutateMaquinas();
    } finally {
      setSaving(false);
    }
  }

  // Reaproveitado em desfazer para repetir a chamada com ignoreOpen=1
  async function postDesfazer(id: string, ignoreOpen = false) {
    const q = ignoreOpen ? "?ignoreOpen=1" : "";
    const urls = [
      `/api/paradas/${encodeURIComponent(id)}/desfazer${q}`,
      `/api/paradas/${encodeURIComponent(id)}/reabrir${q}`,
    ];

    let lastMessage = "Falha ao desfazer a finalização.";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ignoreOpen }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {}

        if (res.ok) return { ok: true as const };

        // conflitos tratados pelo backend (já aberta / outra aberta)
        if (res.status === 409) {
          return {
            ok: false as const,
            conflict: true as const,
            code: data?.code || "CONFLICT",
            message:
              data?.message ||
              data?.error ||
              "Já existe outra parada em aberto para esta máquina.",
          };
        }

        // 404 pode ser "parada não encontrada" ou caminho errado
        if (res.status === 404) {
          lastMessage =
            data?.message || data?.error || "Parada não encontrada.";
          // tenta a próxima URL (ex.: caiu em /desfazer mas servidor só tem /reabrir)
          continue;
        }

        lastMessage =
          data?.message ||
          data?.error ||
          `Falha ao desfazer (HTTP ${res.status}).`;
        // tenta a próxima URL
      } catch (e) {
        lastMessage = (e as Error).message || lastMessage;
      }
    }

    return {
      ok: false as const,
      conflict: false as const,
      message: lastMessage,
    };
  }

  async function desfazerFinalizacao() {
    if (!editing) return;
    try {
      setSaving(true);
      const result = await postDesfazer(editing.id, false);
      if (!result.ok && result.conflict) {
        // Abre modal de confirmação
        setConfirm({
          open: true,
          message:
            result.message ||
            "Já existe uma parada em aberto para esta máquina. Deseja reabrir assim mesmo?",
          onYes: async () => {
            setConfirm({ open: false, message: "" });
            setSaving(true);
            const retry = await postDesfazer(editing.id, true);
            setSaving(false);
            if (!retry.ok) {
              alert(retry.message || "Falha ao desfazer a finalização.");
              return;
            }
            await mutateHist();
            await mutateMaquinas();
            setEditOpen(false);
          },
        });
        return;
      }
      if (!result.ok) throw new Error(result.message || "Falha ao desfazer.");
      await mutateHist();
      await mutateMaquinas();
      setEditOpen(false);
    } catch (e) {
      alert((e as Error).message || "Falha ao desfazer a finalização.");
    } finally {
      setSaving(false);
    }
  }

  // ESC fecha modais
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirm.open) setConfirm({ open: false, message: "" });
        else if (editOpen) setEditOpen(false);
        else if (selected) setSelected(null);
        setWppOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen, selected, confirm.open]);

  useEffect(() => {
    if (!selected) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && e.target === modalRef.current) {
        setSelected(null);
      }
    };

    const node = modalRef.current;
    if (node) node.addEventListener("click", handleClickOutside);

    return () => {
      if (node) node.removeEventListener("click", handleClickOutside);
    };
  }, [selected]);

  // trava o scroll quando alguma modal estiver aberta
  useEffect(() => {
    const anyOpen = !!selected || editOpen || confirm.open || wppOpen;
    const original = document.body.style.overflow;
    document.body.style.overflow = anyOpen ? "hidden" : original;
    return () => {
      document.body.style.overflow = original;
    };
  }, [selected, editOpen, confirm.open, wppOpen]);

  /* ===== Componente do card da máquina (calcula "status visual") ===== */
  function MachineItem({ m }: { m: Maquina }) {
    const shouldCheck = m.status !== "ATIVA";
    const { data } = useSWR<{ ok: boolean; data: Parada[] }>(
      shouldCheck ? `/api/maquinas/${m.id}/paradas?status=ATIVA` : null,
      fetcher,
      { revalidateOnFocus: false }
    );
    const aberta = data?.data?.find((p) => !p.horaFinalizacao);

    let visualStatus: Maquina["status"] = m.status;
    if (aberta) {
      const cat = aberta.categoria || "";
      if (CATS_OP.includes(cat)) visualStatus = "MANUTENCAO";
      else visualStatus = "PARADA";
    }

    return (
      <li
        className={`${styles.item} ${styles[visualStatus]}`}
        onClick={() => setSelected(m)}
        title="Ver histórico de paradas"
      >
        <div className={styles.itemTop}>
          <span className={styles.codigo}>{m.codigo}</span>
          <span className={badgeClass(visualStatus)}>
            {visualStatus === "ATIVA"
              ? "FUNCIONANDO"
              : visualStatus === "MANUTENCAO"
              ? "MANUTENÇÃO"
              : "PARADA"}
          </span>
        </div>
        <div className={styles.itemBottom}>
          <span className={styles.nome}>{m.nome}</span>
          {visualStatus === "ATIVA" && <AtivaIndicator />}
          {(visualStatus === "PARADA" || visualStatus === "MANUTENCAO") && (
            <ParadaTimer maquinaId={m.id} status={visualStatus} />
          )}
        </div>
      </li>
    );
  }

  return (
    <Layout requireAuth={true}>
      <div className={styles.container}>
        {/* Header fixo; botão só alterna fullscreen */}
        <div className={styles.headerRow}>
          <h1 className={styles.title}>Painel de Máquinas</h1>
          <button
            type="button"
            className={styles.fullscreenBtn}
            onClick={() => setFullscreen((v) => !v)}
            title={
              fullscreen
                ? "Sair do modo tela cheia"
                : "Modo tela cheia - Ocultar KPIs e filtros"
            }
          >
            {fullscreen ? (
              <>
                <Minimize2 size={20} />
                <span className={styles.btnText}>Mostrar KPIs</span>
              </>
            ) : (
              <>
                <Maximize2 size={20} />
                <span className={styles.btnText}>Tela Cheia</span>
              </>
            )}
          </button>
        </div>

        {/* KPIs — escondidos no fullscreen */}
        {!fullscreen && (
          <section className={styles.kpis} aria-live="polite">
            <div className={`${styles.kpi} ${styles.kpiT}`}>
              <span className={styles.kpiLabel}>Total</span>
              <strong className={styles.kpiValue}>{totais.total}</strong>
              <span className={styles.kpiHint}>
                <Factory size={22} className={styles.timerT} /> Máquinas
              </span>
            </div>
            <div className={`${styles.kpi} ${styles.kpiF}`}>
              <span className={styles.kpiLabel}>Funcionando</span>
              <strong className={`${styles.kpiValue} ${styles.good}`}>
                {totais.ativas}
              </strong>
              <span className={styles.kpiHint}>
                <Cog size={22} strokeWidth={2} className={styles.timerF} />{" "}
                ATIVA
              </span>
            </div>
            <div className={`${styles.kpi} ${styles.kpiP}`}>
              <span className={styles.kpiLabel}>Paradas (N/Oper.)</span>
              <strong className={`${styles.kpiValue} ${styles.bad}`}>
                {paradasNaoOperacionais}
              </strong>
              <span className={styles.kpiHint}>
                <Clock size={22} strokeWidth={2} className={styles.timerP} />{" "}
                PARADA
              </span>
            </div>
            <div className={`${styles.kpi} ${styles.kpiM}`}>
              <span className={styles.kpiLabel}>Manutenção (Oper.)</span>
              <strong className={`${styles.kpiValue} ${styles.warn}`}>
                {paradasOperacionais}
              </strong>
              <span className={styles.kpiHint}>
                <Clock size={22} strokeWidth={2} className={styles.timerM} />{" "}
                MANUTENÇÃO
              </span>
            </div>
          </section>
        )}

        {/* Filtro — escondido no fullscreen */}
        {!fullscreen && (
          <form className={styles.form}>
            <div className={styles.filterSection}>
              <select
                className={styles.input}
                value={selecaoSecao}
                onChange={(e) => setSelecaoSecao(e.target.value)}
              >
                <option value="TODAS">Todas as Seções</option>
                {Object.keys(grupos).map((secao) => (
                  <option key={secao} value={secao}>
                    {secao}
                  </option>
                ))}
                <option value="Sem seção">Sem Seção</option>
              </select>
            </div>
          </form>
        )}

        {/* Seções / Máquinas — INALTERADO */}
        <div className={styles.sectionsGrid}>
          {Object.entries(grupos)
            .filter(
              ([secao]) => selecaoSecao === "TODAS" || secao === selecaoSecao
            )
            .map(([secao, maquinasDoGrupo]) => (
              <section key={secao} className={`card ${styles.emptyCard}`}>
                <header className={styles.secaoHeader}>
                  <h3>{secao}</h3>
                  <span className={styles.count}>
                    {maquinasDoGrupo.length} máquinas: (
                    {maquinasDoGrupo.filter((m) => m.status === "ATIVA").length}{" "}
                    funcionando,{" "}
                    {maquinasDoGrupo.filter((m) => m.status !== "ATIVA").length}{" "}
                    paradas)
                  </span>
                </header>

                <ul className={styles.maquinasList}>
                  {maquinasDoGrupo.map((m) => (
                    <MachineItem key={m.id} m={m} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
        {/* ===== TODOS OS MODAIS ORIGINAIS PERMANECEM IGUAIS ===== */}
        {/* Modal HISTÓRICO */}
        {selected &&
          createPortal(
            <div
              className={styles.modalOverlay}
              onClick={() => {
                setSelected(null);
                clearSelection();
              }}
              aria-hidden
            >
              <div
                ref={modalRef}
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.modalCard}>
                  <header className={styles.modalHeader}>
                    <div className={styles.modalTitleWrap}>
                      <Search size={16} />
                      <h4 className={styles.modalTitle}>
                        <span className={styles.hideOnMobile}>
                          Histórico —{" "}
                        </span>
                        {selected.nome}{" "}
                        <span className={styles.dim}>({selected.codigo})</span>
                      </h4>
                    </div>

                    {/* Ações no cabeçalho: WhatsApp + Fechar */}
                    <div
                      className={styles.filterItem}
                      style={{ display: "flex", gap: 8 }}
                    >
                      <button
                        className={styles.whatsBtn}
                        disabled={selCount === 0}
                        onClick={() => setWppOpen(true)}
                        title={
                          selCount === 0
                            ? "Selecione ao menos uma parada para enviar"
                            : `Enviar ${selCount} registro(s) por WhatsApp`
                        }
                      >
                        <FaWhatsapp size={16} /> <span>WhatsApp</span>
                      </button>

                      <button
                        className={styles.closeBtn}
                        onClick={() => {
                          setSelected(null);
                          clearSelection();
                        }}
                        aria-label="Fechar"
                        title="Fechar"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </header>

                  <div className={styles.modalWrap}>
                    {/* Filtros */}
                    <div className={styles.filters}>
                      <div className={styles.filterItem}>
                        <Filter size={14} />
                        <select
                          className={styles.input}
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
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
                    </div>

                    {/* Tabela */}
                    <div className={styles.tableWrap}>
                      <table className={`${styles.table} ${styles.fixedTable}`}>
                        <thead>
                          <tr>
                            <th className={styles.checkCol}>
                              {/* selecionar todos */}
                              <input
                                type="checkbox"
                                aria-label="Selecionar todos"
                                checked={
                                  !!hist?.data?.length &&
                                  selIds.size > 0 &&
                                  selIds.size === hist.data.length
                                }
                                ref={(el) => {
                                  if (!el || !hist?.data?.length) return;
                                  el.indeterminate =
                                    selIds.size > 0 &&
                                    selIds.size < (hist?.data?.length ?? 0);
                                }}
                                onChange={(e) => {
                                  if (!hist?.data) return;
                                  if (e.target.checked) {
                                    selectAll(hist.data.map((p) => p.id));
                                  } else {
                                    clearSelection();
                                  }
                                }}
                              />
                            </th>
                            <th className={styles.catCol}>Categoria</th>
                            <th className={styles.motivoCol}>Motivo</th>
                            <th className={styles.dateCol}>Início</th>
                            <th className={styles.dateCol}>Fim</th>
                            <th className={styles.duracaoCol}>Duração</th>
                            <th className={styles.equipeCol}>Equipe</th>
                            <th className={styles.obsCol}>Observação</th>
                            <th className={styles.acoesCol}>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hist?.data?.length ? (
                            hist.data.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={selIds.has(p.id)}
                                    onChange={() => toggleSelect(p.id)}
                                    aria-label="Selecionar parada"
                                  />
                                </td>
                                <td>
                                  <span
                                    className={`${styles.cat} ${
                                      p.categoria
                                        ? (styles as any)["cat-" + p.categoria]
                                        : ""
                                    }`}
                                  >
                                    {labelCategoria(p.categoria)}
                                  </span>
                                </td>
                                <td
                                  className={styles.motivoCell}
                                  title={p.motivo}
                                >
                                  {p.motivo}
                                </td>
                                <td>{fmtData(p.horaInicio)}</td>
                                <td>
                                  {p.horaFinalizacao ? (
                                    fmtData(p.horaFinalizacao)
                                  ) : (
                                    <span className={styles.tagWarn}>
                                      Em aberto
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {fmtDuracao(p.horaInicio, p.horaFinalizacao)}
                                </td>
                                <td>{p.equipeAtuando ?? "-"}</td>
                                <td
                                  className={styles.obsCell}
                                  title={p.observacao ?? "-"}
                                >
                                  {p.observacao ?? "-"}
                                </td>
                                <td>
                                  <button
                                    className={styles.editBtn}
                                    onClick={() => openEditModal(p)}
                                    title="Editar parada"
                                  >
                                    <Edit size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={9} className={styles.noData}>
                                Nenhum registro encontrado
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Modal de Envio WhatsApp (sobreposta) */}
                {wppOpen && selected && (
                  <div
                    className={styles.modalOverlay2}
                    onClick={(e) => {
                      e.stopPropagation();
                      setWppOpen(false);
                    }}
                    aria-hidden
                  >
                    <div
                      className={styles.modalSm}
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="wppSendTitle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <header className={styles.modalHeader}>
                        <div className={styles.modalTitleWrap}>
                          <MessageCircle size={16} />
                          <h4 className={styles.modalTitle} id="wppSendTitle">
                            <span className={styles.hideOnMobile}>
                              {" "}
                              Enviar Mensagens —{" "}
                            </span>
                            {selected.nome} ({selected.codigo})
                          </h4>
                        </div>
                        <button
                          className={styles.closeBtn}
                          onClick={() => setWppOpen(false)}
                          aria-label="Fechar"
                        >
                          <X size={16} />
                        </button>
                      </header>

                      <div className={styles.form}>
                        {/* Selector de contato */}
                        <div className={styles.formRow}>
                          <label>Selecione um contato</label>
                          <select
                            className={styles.input}
                            value={selectedContatoId}
                            onChange={(e) =>
                              setSelectedContatoId(e.target.value)
                            }
                          >
                            <option value="">— Selecione —</option>
                            {contatos.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome} — {prettyE164(c.celular)}
                              </option>
                            ))}
                          </select>
                          <small className={styles.dim}>
                            Contatos carregados de <code>/api/contatos</code>.
                          </small>
                        </div>

                        {/* Número manual */}
                        <div className={styles.formRow}>
                          <label>Ou informe um número (prioritário)</label>
                          <input
                            className={styles.input}
                            placeholder="(11) 9XXXX-XXXX ou 11999998888"
                            value={manualNumber}
                            onChange={(e) => setManualNumber(e.target.value)}
                          />
                          <small className={styles.hint}>
                            Convertemos automaticamente para +55 (E.164).
                          </small>
                        </div>

                        {/* Prévia da mensagem */}
                        <div className={styles.formRow}>
                          <label>Prévia da mensagem</label>
                          <div
                            style={{
                              whiteSpace: "pre-wrap",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, monospace",
                              border: "1px dashed var(--border)",
                              borderRadius: 8,
                              padding: 12,
                              background: "var(--muted)",
                              maxHeight: 220,
                              overflow: "auto",
                            }}
                          >
                            {(() => {
                              const all = (hist?.data ?? []).filter((p) =>
                                selIds.has(p.id)
                              );
                              return all.length
                                ? buildMensagemWhatsApp(all, selected)
                                : "Selecione as paradas no histórico para compor a mensagem.";
                            })()}
                          </div>
                        </div>

                        <div className={styles.modalFooter}>
                          <button
                            type="button"
                            className={styles.whatsBtn}
                            disabled={selCount === 0}
                            onClick={() => {
                              const paradasSel = (hist?.data ?? []).filter(
                                (p) => selIds.has(p.id)
                              );
                              abrirWhatsApp(paradasSel, selected!);
                              setWppOpen(false);
                            }}
                          >
                            <FaWhatsapp size={18} /> Abrir WhatsApp
                          </button>

                          <button
                            type="button"
                            className={styles.whatsBtn}
                            disabled={
                              selCount === 0 ||
                              (!manualNumber.trim() && !selectedContatoId)
                            }
                            onClick={() => {
                              const paradasSel = (hist?.data ?? []).filter(
                                (p) => selIds.has(p.id)
                              );
                              const contato = contatos.find(
                                (c) => c.id === selectedContatoId
                              );
                              abrirWhatsApp(
                                paradasSel,
                                selected!,
                                contato,
                                manualNumber
                              );
                              setWppOpen(false);
                            }}
                          >
                            <FaWhatsapp size={18} /> Enviar Contato
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Modal de EDIÇÃO (sobreposta) */}
                {editOpen && editing && (
                  <div
                    className={styles.modalOverlay2}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditOpen(false);
                    }}
                    aria-hidden
                  >
                    <div
                      className={styles.modalSm}
                      role="dialog"
                      aria-modal="true"
                      aria-label="Editar parada"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <header className={styles.modalHeader}>
                        <div className={styles.modalTitleWrap}>
                          <Edit size={16} />
                          <h4 className={styles.modalTitle}>Editar parada</h4>
                        </div>
                        <button
                          className={styles.closeBtn}
                          onClick={() => setEditOpen(false)}
                          aria-label="Fechar"
                        >
                          <X size={16} />
                        </button>
                      </header>

                      <form
                        className={styles.form}
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveParada();
                        }}
                      >
                        <div className={styles.formRow}>
                          <label>Motivo</label>
                          <input
                            className={styles.input}
                            value={editing.motivo}
                            onChange={(e) =>
                              setEditing({ ...editing, motivo: e.target.value })
                            }
                            required
                          />
                        </div>

                        {/* Tipo & Categoria */}
                        <div className={styles.formGrid2}>
                          <div>
                            <label>Tipo</label>
                            <select
                              className={styles.input}
                              value={editing.tipo ?? "OPERACIONAL"}
                              onChange={(e) => {
                                const novoTipo = e.target.value as
                                  | "OPERACIONAL"
                                  | "NAO_OPERACIONAL";
                                const pool =
                                  novoTipo === "OPERACIONAL"
                                    ? [...CATS_OP]
                                    : [...CATS_NOP];
                                const catOk =
                                  editing.categoria &&
                                  pool.includes(editing.categoria as any);
                                setEditing({
                                  ...editing,
                                  tipo: novoTipo,
                                  categoria: catOk
                                    ? editing.categoria
                                    : pool[0],
                                });
                              }}
                            >
                              <option value="OPERACIONAL">
                                Operacional (manutenção/produção)
                              </option>
                              <option value="NAO_OPERACIONAL">
                                Não operacional
                              </option>
                            </select>
                          </div>
                          <div>
                            <label>Categoria</label>
                            <select
                              className={styles.input}
                              value={
                                editing.categoria ??
                                (editing.tipo === "NAO_OPERACIONAL"
                                  ? CATS_NOP[0]
                                  : CATS_OP[0])
                              }
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  categoria: e.target.value,
                                })
                              }
                            >
                              {(editing.tipo === "NAO_OPERACIONAL"
                                ? CATS_NOP
                                : CATS_OP
                              ).map((c) => (
                                <option key={c} value={c}>
                                  {labelCategoria(c)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className={styles.formGrid2}>
                          <div>
                            <label>Início</label>
                            <input
                              type="datetime-local"
                              className={styles.input}
                              value={toInputDateTimeValue(editing.horaInicio)}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  horaInicio: e.target.value,
                                })
                              }
                              required
                            />
                          </div>
                          <div>
                            <label>Fim</label>
                            <input
                              type="datetime-local"
                              className={styles.input}
                              value={toInputDateTimeValue(
                                editing.horaFinalizacao
                              )}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  horaFinalizacao:
                                    e.target.value === ""
                                      ? null
                                      : e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className={styles.formGrid2}>
                          <div>
                            <label>Equipe atuando</label>
                            <input
                              className={styles.input}
                              value={editing.equipeAtuando ?? ""}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  equipeAtuando: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div>
                            <label>Observação</label>
                            <input
                              className={styles.input}
                              value={editing.observacao ?? ""}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  observacao: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        <div className={styles.modalFooter}>
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            onClick={() => setEditOpen(false)}
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className={styles.primaryBtn}
                            disabled={saving}
                          >
                            <Save size={16} />{" "}
                            {saving ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            className={styles.successBtn}
                            onClick={() => finalizarParada()}
                            disabled={saving}
                          >
                            <CheckCircle2 size={16} /> Finalizar
                          </button>
                          {editing.horaFinalizacao && (
                            <button
                              type="button"
                              className={styles.warnBtn}
                              onClick={() => desfazerFinalizacao()}
                              disabled={saving}
                              title="Remover o fim e voltar a ficar em PARADA"
                            >
                              <RotateCcw size={16} /> Desfazer finalização
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}
        {/* Modal de CONFIRMAÇÃO genérico */}
        {confirm.open && (
          <div
            className={styles.modalOverlay2}
            onClick={() => setConfirm({ open: false, message: "" })}
            aria-hidden
          >
            <div
              className={styles.modalSm}
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <header className={styles.modalHeader}>
                <div className={styles.modalTitleWrap}>
                  <RotateCcw size={16} />
                  <h4 className={styles.modalTitle}>Confirmar ação</h4>
                </div>
                <button
                  className={styles.closeBtn}
                  onClick={() => setConfirm({ open: false, message: "" })}
                  aria-label="Fechar"
                >
                  <X size={16} />
                </button>
              </header>

              <div className={styles.form} style={{ marginBottom: 0 }}>
                <p style={{ margin: 0 }}>{confirm.message}</p>
                <div className={styles.modalFooter}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => setConfirm({ open: false, message: "" })}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => confirm.onYes?.()}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Modal de CONFIRMAÇÃO genérico */}
        {confirm.open &&
          createPortal(
            <div
              className={styles.confirmOverlay}
              onClick={() => setConfirm({ open: false, message: "" })}
              aria-hidden
            >
              <div
                className={styles.modalSm}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className={styles.modalHeader}>
                  <div className={styles.modalTitleWrap}>
                    <RotateCcw size={16} />
                    <h4 className={styles.modalTitle}>Confirmar ação</h4>
                  </div>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setConfirm({ open: false, message: "" })}
                    aria-label="Fechar"
                  >
                    <X size={16} />
                  </button>
                </header>

                <div className={styles.form} style={{ marginBottom: 0 }}>
                  <p style={{ margin: 0 }}>{confirm.message}</p>
                  <div className={styles.modalFooter}>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => setConfirm({ open: false, message: "" })}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => confirm.onYes?.()}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </Layout>
  );
}
