// pages/paradas/index.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

// ===== Permissões =====
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

/* ========================= Tipos ========================= */
type Secao = { id: string; nome: string | null };
type Maquina = {
  id: string;
  nome: string;
  codigo: string;
  secao?: Secao | null;
};
type Parada = {
  id: string;
  horaInicio: string;
  horaFinalizacao?: string | null;
  motivo: string;
  observacao?: string | null;
  maquina?: Maquina | null;
};
type Contato = { id: string; nome: string; celular: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ========================= Helpers ========================= */
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
function minutesBetween(aISO: string, bISO?: string | null) {
  if (!bISO) return 0;
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.max(0, Math.round((b - a) / 60000));
}
function formatDur(totalMin: number) {
  if (!Number.isFinite(totalMin) || totalMin < 0) totalMin = 0;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/* ========================= Página ========================= */
export default function ParadasList() {
  const router = useRouter();

  // ===== Sessão/Permissões (módulo: paradas) =====
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (action: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "paradas", action);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canCreate = useMemo(() => can("create"), [sess, myRole]);
  const canEdit = useMemo(() => can("edit"), [sess, myRole]);
  const canWhatsapp = useMemo(() => can("whatsapp_send"), [sess, myRole]);

  // Se a sessão já carregou e não pode visualizar => bloqueia
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className={`card ${styles.empty}`} role="alert">
          <strong>Sem acesso à página de Paradas.</strong>
        </div>
      </Layout>
    );
  }

  // filtros
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState<string>("00:00");
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [endTime, setEndTime] = useState<string>("23:59");
  const [statusFilter, setStatusFilter] = useState<
    "todos" | "em_aberto" | "finalizadas"
  >("todos");

  const qp = useMemo(() => {
    const from = `${startDate}T${startTime}:00`;
    const to = `${endDate}T${endTime}:59`;
    const s = new URLSearchParams({
      startDate: from,
      endDate: to,
      status: statusFilter,
    });
    return `?${s.toString()}`;
  }, [startDate, startTime, endDate, endTime, statusFilter]);

  // inclui tenantName para mostrar no cabeçalho
  const { data, mutate, isLoading } = useSWR<{
    data: Parada[];
    tenantName: string;
  }>(`/api/relatorios/paradas${qp}`, fetcher, { revalidateOnFocus: false });

  const rows = data?.data ?? [];
  const tenantName = data?.tenantName ?? "Sua Empresa";

  // seleção múltipla de paradas
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  function toggleOne(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  }

  // id único selecionado (se houver exatamente 1)
  const firstSelectedId = useMemo(() => {
    if (selectedIds.size !== 1) return undefined;
    const it = selectedIds.values();
    const n = it.next();
    return n.done ? undefined : (n.value as string);
  }, [selectedIds]);

  function openSelectedForEdit() {
    if (!canEdit) return;
    if (selectedIds.size !== 1 || !firstSelectedId) return;
    router.push(`/paradas/${firstSelectedId}/editar`);
  }

  // modal whatsapp (apenas 1 destino)
  const [waOpen, setWaOpen] = useState(false);
  const { data: contatosRes } = useSWR<{ data: Contato[] }>(
    waOpen ? "/api/contatos" : null,
    fetcher
  );
  const contatos = contatosRes?.data ?? [];

  const [selectedContatoId, setSelectedContatoId] = useState<string>("");
  const [manualNumber, setManualNumber] = useState<string>(""); // (11) 9XXXX-XXXX ou 1199...
  const [customMessage, setCustomMessage] = useState<string>("");
  const [waLoading, setWaLoading] = useState(false);

  function selectedParadas(): Parada[] {
    const s = selectedIds;
    return rows.filter((r) => s.has(r.id));
  }

  function buildDefaultMessage(paradas: Parada[]) {
    if (paradas.length === 0) return "";

    const header = `*${tenantName}*\n\n*Relatório de Paradas*\n\n*Período:* ${startDate} ${startTime} *até* ${endDate} ${endTime}\n*Status:* ${statusFilter.replace(
      "_",
      " "
    )}\n`;

    const lines = paradas.map((p, i) => {
      const mins = minutesBetween(p.horaInicio, p.horaFinalizacao);
      const inicio = new Date(p.horaInicio).toLocaleString();
      const fim = p.horaFinalizacao
        ? new Date(p.horaFinalizacao).toLocaleString()
        : "—";
      const maq = p.maquina?.nome ?? "-";
      const cod = p.maquina?.codigo ? ` (${p.maquina.codigo})` : "";
      const sec = p.maquina?.secao?.nome ? ` (${p.maquina.secao?.nome})` : "";
      const obs = p.observacao ? `\n  • *Obs:* ${p.observacao}` : "";

      return `*${i + 1}. ${maq}${cod}${sec}*\n  • *Motivo:* ${
        p.motivo
      }\n  • *Início:* ${inicio}\n  • *Fim:* ${fim}\n  • *Duração:* ${formatDur(
        mins
      )}${obs}\n----------------------------------------------------`;
    });

    return `${header}\n${lines.join("\n")}`;
  }

  function closeWa() {
    setWaOpen(false);
    setSelectedContatoId("");
    setManualNumber("");
    setCustomMessage("");
  }

  function sendWhatsApp() {
    if (!canWhatsapp) {
      alert("Sem permissão para enviar via WhatsApp.");
      return;
    }
    const paradasSel = selectedParadas();
    if (paradasSel.length === 0) {
      alert("Selecione ao menos uma parada.");
      return;
    }
    const msg =
      (customMessage && customMessage.trim()) ||
      buildDefaultMessage(paradasSel);
    if (!msg) {
      alert("Mensagem vazia.");
      return;
    }

    // prioridade: número manual (se preenchido), senão contato do select
    let target = "";
    const manual = manualNumber.trim();
    if (manual) {
      target = toE164BR(manual);
    } else if (selectedContatoId) {
      const c = contatos.find((x) => x.id === selectedContatoId);
      if (c) target = c.celular; // já deve estar em E.164
    }

    if (!target) {
      alert("Selecione um contato ou informe um número.");
      return;
    }

    const num = onlyDigits(target);
    const enc = encodeURIComponent(msg);
    const url = `https://wa.me/${num}?text=${enc}`;
    window.open(url, "_blank", "noopener,noreferrer");
    closeWa();
  }

  // limpa seleção quando filtros mudarem
  useEffect(() => {
    setSelectedIds(new Set());
  }, [qp]);

  return (
    <Layout requireAuth={true}>
      <div className={styles.head}>
        <h2>
          Paradas{" "}
          <span className={styles.dim} title="Cliente/Fábrica em uso">
            — {tenantName}
          </span>
        </h2>
        <div className={styles.headActions}>
          {/* Cadastrar */}
          {canCreate && (
            <a className={styles.primaryBtn} href="/paradas/novo">
              Cadastrar
            </a>
          )}

          {/* Editar selecionada (exatamente 1) */}
          {canEdit && (
            <button
              className={styles.ghostBtn}
              onClick={openSelectedForEdit}
              disabled={selectedIds.size !== 1}
              title={
                selectedIds.size !== 1
                  ? "Selecione exatamente 1 parada para editar"
                  : "Editar a parada selecionada"
              }
            >
              Editar selecionada
            </button>
          )}

          {/* Enviar via WhatsApp */}
          {canWhatsapp && (
            <button
              className={styles.ghostWBtn}
              disabled={selectedIds.size === 0}
              onClick={() => {
                const msg = buildDefaultMessage(selectedParadas());
                setCustomMessage(msg);
                setWaOpen(true);
              }}
              title={
                selectedIds.size === 0
                  ? "Selecione paradas para enviar"
                  : "Enviar via WhatsApp"
              }
            >
              Enviar via WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* filtros */}
      <div className={`card ${styles.filters}`}>
        <div className={styles.filterRow}>
          <label className={styles.label}>De</label>
          <input
            className={styles.input}
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <input
            className={styles.input}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />

          <label className={styles.label}>Até</label>
          <input
            className={styles.input}
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <input
            className={styles.input}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />

          <label className={styles.label}>Status</label>
          <select
            className={styles.input}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="todos">Todas</option>
            <option value="em_aberto">Em andamento</option>
            <option value="finalizadas">Finalizadas</option>
          </select>

          <button className={styles.primaryBtn} onClick={() => mutate()}>
            Aplicar
          </button>
        </div>
      </div>

      {/* tabela */}
      <div className="card">
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th>Máquina</th>
                <th>Seção</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Motivo</th>
                <th>Duração</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    Sem registros no período.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const sel = selectedIds.has(p.id);
                  const mins = minutesBetween(p.horaInicio, p.horaFinalizacao);
                  return (
                    <tr
                      key={p.id}
                      className={sel ? styles.rowSel : ""}
                      onDoubleClick={() => {
                        if (canEdit) router.push(`/paradas/${p.id}/editar`);
                      }}
                      title={
                        canEdit
                          ? "Dê um duplo clique para editar"
                          : "Sem permissão para editar"
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={sel}
                          onChange={() => toggleOne(p.id)}
                          aria-label="Selecionar parada"
                        />
                      </td>
                      <td>
                        {p.maquina?.nome ?? "-"}{" "}
                        <span className={styles.dim}>
                          {p.maquina?.codigo ? `(${p.maquina.codigo})` : ""}
                        </span>
                      </td>
                      <td>{p.maquina?.secao?.nome ?? "-"}</td>
                      <td>{new Date(p.horaInicio).toLocaleString()}</td>
                      <td>
                        {p.horaFinalizacao
                          ? new Date(p.horaFinalizacao).toLocaleString()
                          : "—"}
                      </td>
                      <td className={styles.trunc}>{p.motivo}</td>
                      <td className={styles.num}>{formatDur(mins)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* modal whatsapp — 1 contato */}
      {waOpen && canWhatsapp && (
        <>
          <div className={styles.modalOverlay} onClick={closeWa} />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={`card ${styles.modalCard}`}>
              <h3 className={styles.modalTitle}>Enviar via WhatsApp</h3>
              <p className={styles.modalText}>
                {selectedIds.size} parada(s) selecionada(s). Escolha{" "}
                <strong>um contato</strong> ou informe um número manualmente.
                Você pode editar a mensagem abaixo antes de enviar.
              </p>

              <div className={styles.modalGrid}>
                <div className={styles.contactColumn}>
                  <div className={styles.contactHead}>
                    <strong>Contato</strong>
                    <span className={styles.dimSmall}>
                      {contatos.length} cadastrado(s)
                    </span>
                  </div>

                  <label className={styles.label}>Selecione um contato</label>
                  <select
                    className={styles.input}
                    value={selectedContatoId}
                    onChange={(e) => setSelectedContatoId(e.target.value)}
                  >
                    <option value="">— Selecione —</option>
                    {contatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} — {prettyE164(c.celular)}
                      </option>
                    ))}
                  </select>

                  <div
                    className={styles.customBox}
                    style={{ marginTop: ".75rem" }}
                  >
                    <label className={styles.label}>
                      Ou informe um número (prioritário)
                    </label>
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
                </div>

                <div className={styles.messageColumn}>
                  <label className={styles.label}>Mensagem</label>
                  <textarea
                    className={styles.textarea}
                    rows={16}
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="O texto padrão é gerado com base nas paradas selecionadas. Edite livremente antes de enviar."
                  />
                </div>
              </div>

              <div className={styles.modalActions}>
                <button className={styles.ghostBtn} onClick={closeWa}>
                  Cancelar
                </button>
                <button
                  className={styles.ghostWBtn}
                  onClick={sendWhatsApp}
                  disabled={waLoading}
                >
                  {waLoading ? "Preparando..." : "Abrir WhatsApp"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
