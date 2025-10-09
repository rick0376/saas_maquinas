import React, { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { createPortal } from "react-dom";
import { FaWhatsapp } from "react-icons/fa";
import { X } from "lucide-react";

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
  tipo?: "OPERACIONAL" | "NAO_OPERACIONAL" | null;
  categoria?: string | null;
};
type Contato = {
  id: string;
  nome: string;
  celular: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const CATEGORY_LABELS: Record<string, string> = {
  MANUTENCAO_CORRETIVA: "Manut. Corretiva",
  MANUTENCAO_PREVENTIVA: "Manut. Preventiva",
  SETUP_TROCA_FERRAMENTA: "Setup/Troca Ferr.",
  ABASTECIMENTO: "Abastecimento",
  LIMPEZA: "Limpeza",
  QUALIDADE: "Qualidade",
  ALMOCO: "Almoço",
  BANHEIRO: "Banheiro",
  REUNIAO: "Reunião",
  TREINAMENTO: "Treinamento",
  DDS: "DDS",
  OUTROS: "Outros",
};

function labelCategoria(cat?: string | null): string {
  return cat ? CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ") : "-";
}

function fmtDataBr(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso!;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtDuracaoTexto(ini: string, fim?: string | null): string {
  const dtIni = new Date(ini).getTime();
  const dtFim = fim ? new Date(fim).getTime() : Date.now();
  const diffMs = Math.max(0, dtFim - dtIni);
  const diffSeg = Math.floor(diffMs / 1000);
  const horas = Math.floor(diffSeg / 3600);
  const minutos = Math.floor((diffSeg % 3600) / 60);
  const segundos = diffSeg % 60;
  return (
    String(horas).padStart(2, "0") +
    ":" +
    String(minutos).padStart(2, "0") +
    ":" +
    String(segundos).padStart(2, "0")
  );
}

function onlyDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

function toE164BR(phone: string): string {
  const digits = onlyDigits(phone);
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export default function Painel() {
  const { data: maquinasResp } = useSWR<{ data: Maquina[] }>(
    "/api/painel/maquinas",
    fetcher,
    { refreshInterval: 5000 }
  );
  const maquinas = maquinasResp?.data ?? [];

  const { data: contatosResp } = useSWR<{ data: Contato[] }>(
    "/api/contatos",
    fetcher,
    { revalidateOnFocus: false }
  );
  const contatos = contatosResp?.data ?? [];

  const [groupedView, setGroupedView] = useState(false);
  const [selected, setSelected] = useState<Maquina | null>(null);
  const [selIds, setSelIds] = useState(new Set<string>());
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [wppOpen, setWppOpen] = useState(false);
  const [selectedContatoId, setSelectedContatoId] = useState("");
  const [manualNumber, setManualNumber] = useState("");

  const groupedMachines = useMemo(() => {
    const groups: Record<string, Maquina[]> = {};
    maquinas.forEach((m) => {
      const key = m.secao?.nome ?? "Sem Seção";
      (groups[key] ||= []).push(m);
    });
    for (const key in groups)
      groups[key].sort((a, b) => a.codigo.localeCompare(b.codigo));
    return groups;
  }, [maquinas]);

  const { data: histResp } = useSWR<{ ok: boolean; data: Parada[] }>(
    selected ? `/api/painel/maquinas/${selected.id}/paradas` : null,
    fetcher,
    { refreshInterval: 5000 }
  );
  const hist = histResp?.data ?? [];

  const filteredHist = useMemo(() => {
    if (!filterStart && !filterEnd) return hist;
    const startTs = filterStart
      ? new Date(filterStart).getTime()
      : Number.MIN_SAFE_INTEGER;
    const endTs = filterEnd
      ? new Date(filterEnd).getTime()
      : Number.MAX_SAFE_INTEGER;
    return hist.filter((p) => {
      const ts = new Date(p.horaInicio).getTime();
      return ts >= startTs && ts <= endTs;
    });
  }, [hist, filterStart, filterEnd]);

  function toggleSelect(id: string) {
    setSelIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }

  function selectAll() {
    setSelIds(new Set(filteredHist.map((p) => p.id)));
  }

  function clearSelection() {
    setSelIds(new Set());
  }

  function buildMensagemWhatsApp(paradas: Parada[], maquina: Maquina) {
    if (!paradas.length) return "";
    const header = `*Relatório de Paradas*\n\n*Máquina:* ${maquina.nome} (${maquina.codigo})\n\n`;
    const body = paradas
      .map((p, i) => {
        const tipo =
          p.tipo === "NAO_OPERACIONAL" ? "Não Operacional" : "Operacional";
        const categoria = labelCategoria(p.categoria);
        const inicio = fmtDataBr(p.horaInicio);
        const fim = p.horaFinalizacao ? fmtDataBr(p.horaFinalizacao) : "—";
        const dur = fmtDuracaoTexto(p.horaInicio, p.horaFinalizacao);
        const equipe = p.equipeAtuando ? `\n• Equipe: ${p.equipeAtuando}` : "";
        const obs = p.observacao ? `\n• Observação: ${p.observacao}` : "";
        return `${i + 1}. ${categoria} — ${
          p.motivo
        }\nTipo: ${tipo}\nInício: ${inicio}\nFim: ${fim}\nDuração: ${dur}${equipe}${obs}\n-----------------------------------`;
      })
      .join("\n");
    return header + body;
  }

  function abrirWhatsApp(
    paradas: Parada[],
    maquina: Maquina,
    contato?: Contato,
    numeroManual?: string
  ) {
    if (!paradas.length) return;
    const texto = buildMensagemWhatsApp(paradas, maquina);
    const manual = numeroManual?.trim() || "";
    let target = "";
    if (manual) target = toE164BR(manual);
    else if (contato?.celular) target = contato.celular;
    const num = onlyDigits(target);
    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setWppOpen(false);
  }

  return (
    <Layout requireAuth>
      <div className={styles.container}>
        <h1 className={styles.titulo}>Painel de Máquinas</h1>

        <div className={styles.control}>
          <label>
            <input
              type="checkbox"
              checked={groupedView}
              onChange={(e) => setGroupedView(e.target.checked)}
            />
            Visualizar por Seções
          </label>
        </div>

        {groupedView ? (
          Object.entries(groupedMachines).map(([secaoNome, maquinasSecao]) => (
            <section key={secaoNome} className={styles.secao}>
              <h2 className={styles.secaoTitulo}>{secaoNome}</h2>
              <div className={styles.grid}>
                {maquinasSecao.map((m) => (
                  <div
                    key={m.id}
                    tabIndex={0}
                    role="button"
                    className={`${styles.card} ${
                      styles[m.status.toLowerCase()]
                    }`}
                    title={`Máquina: ${m.nome} — Status: ${m.status}`}
                    onClick={() => {
                      setSelected(m);
                      clearSelection();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSelected(m);
                        clearSelection();
                      }
                    }}
                  >
                    <div className={styles.cardHeader}>
                      <span className={styles.codigo}>{m.codigo}</span>
                      <span className={styles.statusTag}>{m.status}</span>
                    </div>
                    <div className={styles.cardNome}>{m.nome}</div>
                    <div className={styles.cardSecao}>
                      {m.secao?.nome ?? "Sem Seção"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className={styles.grid}>
            {maquinas.length > 0 ? (
              maquinas.map((m) => (
                <div
                  key={m.id}
                  tabIndex={0}
                  role="button"
                  className={`${styles.card} ${styles[m.status.toLowerCase()]}`}
                  title={`Máquina: ${m.nome} — Status: ${m.status}`}
                  onClick={() => {
                    setSelected(m);
                    clearSelection();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setSelected(m);
                      clearSelection();
                    }
                  }}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.codigo}>{m.codigo}</span>
                    <span className={styles.statusTag}>{m.status}</span>
                  </div>
                  <div className={styles.cardNome}>{m.nome}</div>
                  <div className={styles.cardSecao}></div>
                </div>
              ))
            ) : (
              <p>Nenhuma máquina cadastrada</p>
            )}
          </div>
        )}

        {selected &&
          createPortal(
            <div
              className={styles.modalOverlay}
              onClick={() => setSelected(null)}
              aria-hidden="true"
            >
              <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className={styles.modalHeader}>
                  <h4>{`Histórico — ${selected.nome} (${selected.codigo})`}</h4>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setSelected(null)}
                    aria-label="Fechar"
                  >
                    <X size={20} />
                  </button>
                </header>

                <div className={styles.filterBar}>
                  <label>
                    Início
                    <input
                      type="datetime-local"
                      value={filterStart}
                      onChange={(e) => setFilterStart(e.target.value)}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      type="datetime-local"
                      value={filterEnd}
                      onChange={(e) => setFilterEnd(e.target.value)}
                    />
                  </label>
                  <button type="button" onClick={clearSelection}>
                    Limpar Seleção
                  </button>
                </div>

                <div className={styles.actionBar}>
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={selIds.size === filteredHist.length}
                  >
                    Selecionar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setWppOpen(true)}
                    disabled={selIds.size === 0}
                    className={styles.whatsappBtn}
                  >
                    <FaWhatsapp size={18} /> Enviar WhatsApp
                  </button>
                </div>

                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Seleção</th>
                      <th>Categoria</th>
                      <th>Motivo</th>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Duração</th>
                      <th>Equipe</th>
                      <th>Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHist.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                          />
                        </td>
                        <td title={labelCategoria(p.categoria)}>
                          {labelCategoria(p.categoria)}
                        </td>
                        <td title={p.motivo ?? ""}>{p.motivo ?? ""}</td>
                        <td>{fmtDataBr(p.horaInicio)}</td>
                        <td>
                          {p.horaFinalizacao ? (
                            fmtDataBr(p.horaFinalizacao)
                          ) : (
                            <em>Em andamento</em>
                          )}
                        </td>
                        <td>
                          {fmtDuracaoTexto(p.horaInicio, p.horaFinalizacao)}
                        </td>
                        <td title={p.equipeAtuando ?? ""}>
                          {p.equipeAtuando ?? ""}
                        </td>
                        <td title={p.observacao ?? ""}>{p.observacao ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>,
            document.body
          )}

        {wppOpen &&
          createPortal(
            <div
              className={styles.modalOverlay}
              onClick={() => setWppOpen(false)}
              aria-hidden="true"
            >
              <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <header className={styles.modalHeader}>
                  <h4>Enviar Mensagem WhatsApp</h4>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setWppOpen(false)}
                    aria-label="Fechar"
                  >
                    <X size={20} />
                  </button>
                </header>
                <div className={styles.modalBody}>
                  <label className={styles.selectLabel} htmlFor="selectContato">
                    Contato:
                  </label>
                  <select
                    id="selectContato"
                    className={styles.selectInput}
                    value={selectedContatoId}
                    onChange={(e) => setSelectedContatoId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {contatos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome} - {c.celular}
                      </option>
                    ))}
                  </select>
                  <label
                    className={styles.manualNumberLabel}
                    htmlFor="manualNumber"
                  >
                    Número manual:
                  </label>
                  <input
                    id="manualNumber"
                    type="text"
                    className={styles.manualNumberInput}
                    placeholder="55119999999"
                    value={manualNumber}
                    onChange={(e) => setManualNumber(e.target.value)}
                  />
                  <div className={styles.previewMensagem}>
                    <h5>Visualizar mensagem:</h5>
                    <pre>
                      {selected
                        ? buildMensagemWhatsApp(
                            filteredHist.filter((p) => selIds.has(p.id)),
                            selected
                          )
                        : ""}
                    </pre>
                  </div>
                  <div className={styles.botoesEnvio}>
                    <button
                      disabled={
                        selIds.size === 0 &&
                        manualNumber.trim() === "" &&
                        selectedContatoId === ""
                      }
                      onClick={() => {
                        if (!selected) return;
                        const contato = contatos.find(
                          (c) => c.id === selectedContatoId
                        );
                        const telefone =
                          manualNumber.trim() || contato?.celular || "";
                        abrirWhatsApp(
                          filteredHist.filter((p) => selIds.has(p.id)),
                          selected,
                          contato,
                          telefone
                        );
                      }}
                    >
                      Enviar WhatsApp
                    </button>
                    <button
                      onClick={() => {
                        if (!selected) return;
                        const mensagem = buildMensagemWhatsApp(
                          filteredHist.filter((p) => selIds.has(p.id)),
                          selected
                        );
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
                          "_blank",
                          "noopener noreferrer"
                        );
                        setWppOpen(false);
                      }}
                    >
                      Abrir WhatsApp e escolher contato
                    </button>
                    <button onClick={() => setWppOpen(false)}>Cancelar</button>
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
