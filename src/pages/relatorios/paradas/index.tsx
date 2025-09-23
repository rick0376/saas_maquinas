// src/pages/relatorios/paradas/index.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../../utils/permissions";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ====== Tipos e categorias (espelham o schema) ======
type ParadaTipo = "OPERACIONAL" | "NAO_OPERACIONAL";

// Aceita strings livres pra não quebrar caso a API não normalize
type ParadaCategoria =
  | "MANUTENCAO_CORRETIVA"
  | "MANUTENCAO_PREVENTIVA"
  | "SETUP_TROCA_FERRAMENTA"
  | "FALTA_MATERIAL"
  | "QUALIDADE_INSPECAO"
  | "AJUSTE_PROCESSO"
  | "ABASTECIMENTO"
  | "LIMPEZA"
  | "ALMOCO"
  | "BANHEIRO"
  | "REUNIAO"
  | "TREINAMENTO"
  | "DDS"
  | "OUTROS_NAO_OPERACIONAL"
  | string
  | null;

// ⚙️ dicionário de rótulos por categoria (em UPPER)
const LABEL_BY_CAT: Record<string, string> = {
  MANUTENCAO_CORRETIVA: "Manutenção corretiva",
  MANUTENCAO_PREVENTIVA: "Manutenção preventiva",
  SETUP_TROCA_FERRAMENTA: "Setup / Troca de ferramenta",
  FALTA_MATERIAL: "Falta de material",
  QUALIDADE_INSPECAO: "Qualidade / Inspeção",
  AJUSTE_PROCESSO: "Ajuste de processo",
  ABASTECIMENTO: "Abastecimento",
  LIMPEZA: "Limpeza",
  ALMOCO: "Almoço",
  BANHEIRO: "Banheiro",
  REUNIAO: "Reunião",
  TREINAMENTO: "Treinamento",
  DDS: "DDS",
  OUTROS_NAO_OPERACIONAL: "Outros (não-operacional)",
};

// conjuntos para inferência do tipo pela categoria
const OP_CATS = new Set([
  "MANUTENCAO_CORRETIVA",
  "MANUTENCAO_PREVENTIVA",
  "SETUP_TROCA_FERRAMENTA",
  "FALTA_MATERIAL",
  "QUALIDADE_INSPECAO",
  "AJUSTE_PROCESSO",
  "ABASTECIMENTO",
  "LIMPEZA",
]);
const NOP_CATS = new Set([
  "ALMOCO",
  "BANHEIRO",
  "REUNIAO",
  "TREINAMENTO",
  "DDS",
  "OUTROS_NAO_OPERACIONAL",
]);

const TIPO_OPTIONS: { value: "" | ParadaTipo; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "OPERACIONAL", label: "Operacional" },
  { value: "NAO_OPERACIONAL", label: "Não-operacional" },
];

const CATEGORIA_OPTIONS: {
  value: "" | ParadaCategoria;
  label: string;
  tipo: "" | ParadaTipo; // amarra cada categoria ao tipo (ou "" = todos)
}[] = [
  // Operacionais
  { value: "", label: "Todas", tipo: "" },
  {
    value: "MANUTENCAO_CORRETIVA",
    label: "Manutenção corretiva",
    tipo: "OPERACIONAL",
  },
  {
    value: "MANUTENCAO_PREVENTIVA",
    label: "Manutenção preventiva",
    tipo: "OPERACIONAL",
  },
  {
    value: "SETUP_TROCA_FERRAMENTA",
    label: "Setup / Troca de ferramenta",
    tipo: "OPERACIONAL",
  },
  { value: "FALTA_MATERIAL", label: "Falta de material", tipo: "OPERACIONAL" },
  {
    value: "QUALIDADE_INSPECAO",
    label: "Qualidade / Inspeção",
    tipo: "OPERACIONAL",
  },
  {
    value: "AJUSTE_PROCESSO",
    label: "Ajuste de processo",
    tipo: "OPERACIONAL",
  },
  { value: "ABASTECIMENTO", label: "Abastecimento", tipo: "OPERACIONAL" },
  { value: "LIMPEZA", label: "Limpeza", tipo: "OPERACIONAL" },
  // Não-operacionais
  { value: "ALMOCO", label: "Almoço", tipo: "NAO_OPERACIONAL" },
  { value: "BANHEIRO", label: "Banheiro", tipo: "NAO_OPERACIONAL" },
  { value: "REUNIAO", label: "Reunião", tipo: "NAO_OPERACIONAL" },
  { value: "TREINAMENTO", label: "Treinamento", tipo: "NAO_OPERACIONAL" },
  { value: "DDS", label: "DDS", tipo: "NAO_OPERACIONAL" },
  {
    value: "OUTROS_NAO_OPERACIONAL",
    label: "Outros (não-operacional)",
    tipo: "NAO_OPERACIONAL",
  },
];

type Linha = {
  id: string;
  horaInicio: string;
  horaFinalizacao?: string | null;
  motivo: string;
  // <- aceita string | null pra compatibilidade
  tipo?: ParadaTipo | string | null;
  categoria?: ParadaCategoria;
  maquina?: {
    id: string;
    nome: string;
    codigo: string;
    secao?: { id: string; nome: string | null } | null;
  } | null;
};

type ApiResp = {
  ok: boolean;
  data: Linha[];
  tenantName: string;
};

// ============ Helpers ============
function minutesBetween(aISO: string, bISO?: string | null) {
  if (!bISO) return 0;
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.max(0, Math.round((b - a) / 60000));
}
function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} min`;
}
function normCat(v?: ParadaCategoria): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.toUpperCase();
}
function inferTipoFromCategoria(
  cat?: ParadaCategoria | null
): ParadaTipo | null {
  const c = normCat(cat);
  if (!c) return null;
  if (NOP_CATS.has(c)) return "NAO_OPERACIONAL";
  if (OP_CATS.has(c)) return "OPERACIONAL";
  return null;
}
function normTipo(
  t?: ParadaTipo | string | null,
  cat?: ParadaCategoria | null
): ParadaTipo | null {
  const s = t ? String(t).trim().toUpperCase() : "";
  if (s === "OPERACIONAL" || s === "NAO_OPERACIONAL") return s as ParadaTipo;
  return inferTipoFromCategoria(cat);
}
function labelTipo(t?: ParadaTipo | string | null) {
  const s = t ? String(t).trim().toUpperCase() : "";
  if (s === "NAO_OPERACIONAL") return "Não-operacional";
  if (s === "OPERACIONAL") return "Operacional";
  return "-";
}
function labelCategoria(v?: ParadaCategoria) {
  const key = normCat(v);
  if (!key) return "—";
  return LABEL_BY_CAT[key] ?? key.replace(/_/g, " ");
}

export default function RelParadas() {
  // ===== Sessão/Permissões =====
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "relatorios_paradas", a);
  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canExportPdf = useMemo(() => can("exportPdf"), [sess, myRole]);
  const blockView = !!sess && !canView;

  // ===== Filtros =====
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [tipo, setTipo] = useState<"" | ParadaTipo>("");
  const [categoria, setCategoria] = useState<"" | ParadaCategoria>("");
  const [maquinaId, setMaquinaId] = useState<string>("");
  const [secaoId, setSecaoId] = useState<string>("");
  const [q, setQ] = useState<string>(""); // busca por motivo/código/nome

  // Combos auxiliares (máquinas / seções)
  const { data: maq } = useSWR<{
    data: { id: string; nome: string; codigo: string }[];
  }>("/api/maquinas", fetcher, { revalidateOnFocus: false });
  const { data: sec } = useSWR<{ data: { id: string; nome: string }[] }>(
    "/api/secoes",
    fetcher,
    { revalidateOnFocus: false }
  );

  // URL com filtros
  const url = useMemo(() => {
    const p = new URLSearchParams();
    p.set("startDate", startDate);
    p.set("endDate", endDate);
    if (tipo) p.set("tipo", tipo);
    if (categoria) p.set("categoria", String(categoria));
    if (maquinaId) p.set("maquinaId", maquinaId);
    if (secaoId) p.set("secaoId", secaoId);
    if (q.trim()) p.set("q", q.trim());
    return `/api/relatorios/paradas?${p.toString()}`;
  }, [startDate, endDate, tipo, categoria, maquinaId, secaoId, q]);

  const { data, mutate, isLoading } = useSWR<ApiResp>(url, fetcher, {
    revalidateOnFocus: false,
  });

  // 🔧 Normalização (AQUI estava o problema visual)
  const rows = useMemo(() => {
    const src = data?.data ?? [];
    return src.map((r) => {
      const tipoNorm = normTipo(r.tipo, r.categoria ?? null);
      const catNorm = normCat(r.categoria);
      return {
        ...r,
        tipo: tipoNorm,
        categoria: catNorm as ParadaCategoria | null,
      };
    });
  }, [data?.data]);

  const empresa = data?.tenantName ?? "Sua Empresa";

  // ==== Resumo (totais) ====
  const resumo = useMemo(() => {
    const totalParadas = rows.length;
    const totalMin = rows.reduce(
      (s, r) => s + minutesBetween(r.horaInicio, r.horaFinalizacao),
      0
    );
    const op = rows.filter((r) => r.tipo === "OPERACIONAL");
    const nop = rows.filter((r) => r.tipo === "NAO_OPERACIONAL");
    const opMin = op.reduce(
      (s, r) => s + minutesBetween(r.horaInicio, r.horaFinalizacao),
      0
    );
    const nopMin = nop.reduce(
      (s, r) => s + minutesBetween(r.horaInicio, r.horaFinalizacao),
      0
    );

    // top categorias
    const byCat = new Map<string, number>();
    for (const r of rows) {
      const key = labelCategoria(r.categoria) || "—";
      byCat.set(key, (byCat.get(key) || 0) + 1);
    }
    const topCategorias = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cat, qtd]) => ({ cat, qtd }));

    return { totalParadas, totalMin, opMin, nopMin, topCategorias };
  }, [rows]);

  // ===== PDF =====
  async function getLogoBase64(): Promise<string> {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/imagens/logo2.png`;
      const resp = await fetch(url, { cache: "no-store" });
      if (!resp.ok) return "";
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () =>
          resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    } catch {
      return "";
    }
  }

  async function exportPDF() {
    if (!canExportPdf || isLoading) return;
    const logoDataUri = await getLogoBase64();

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Header
    doc.setFillColor(25, 35, 55);
    doc.rect(0, 0, pageW, 40, "F");
    doc.setFillColor(218, 165, 32);
    doc.rect(0, 35, pageW, 5, "F");

    if (logoDataUri) {
      try {
        doc.addImage(logoDataUri, "PNG", 16, 7, 16, 16);
      } catch {}
    }
    const agora = new Date();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("RELATÓRIO DE PARADAS", pageW / 2, 18, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 190, 210);
    doc.text(empresa.toUpperCase(), 8, 25);
    doc.setFontSize(7);
    doc.text("Relatórios Operacionais", 9, 28);
    doc.text(
      `Gerado em ${agora.toLocaleDateString(
        "pt-BR"
      )} ${agora.toLocaleTimeString("pt-BR")}`,
      pageW - 5,
      28,
      { align: "right" }
    );

    let y = 55;

    // Box Período + Filtros
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(220, 225, 235);
    doc.rect(15, y, pageW - 30, 18, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 85);
    doc.text("FILTROS", 20, y + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const filtrosLinha = [
      `Período: ${startDate} — ${endDate}`,
      `Tipo: ${labelTipo(tipo || null)}`,
      `Categoria: ${labelCategoria(categoria || undefined)}`,
    ].join("   |   ");
    doc.text(filtrosLinha, 20, y + 12);

    y += 26;

    // Título tabela
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(25, 35, 55);
    doc.text("PARADAS NO PERÍODO", 15, y);

    // Tabela
    const body = rows.map((p) => {
      const fim = p.horaFinalizacao ? new Date(p.horaFinalizacao) : null;
      const min = minutesBetween(p.horaInicio, p.horaFinalizacao);
      return [
        p.maquina?.nome ?? "-",
        p.maquina?.secao?.nome ?? "-",
        new Date(p.horaInicio).toLocaleString(),
        fim ? fim.toLocaleString() : "—",
        labelTipo(p.tipo),
        labelCategoria(p.categoria),
        p.motivo ?? "-",
        fmtMinutes(min),
      ];
    });

    autoTable(doc, {
      startY: y + 6,
      head: [
        [
          "Máquina",
          "Seção",
          "Início",
          "Fim",
          "Tipo",
          "Categoria",
          "Motivo",
          "Duração",
        ],
      ],
      body,
      theme: "plain",
      margin: { left: 15, right: 15, bottom: 30 },
      styles: {
        fontSize: 8,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        lineColor: [230, 235, 245],
        lineWidth: 0.3,
        halign: "center",
        valign: "middle",
        textColor: [55, 65, 85],
      },
      headStyles: {
        fillColor: [25, 35, 55],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        cellPadding: { top: 5, bottom: 5, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { halign: "left", cellWidth: 34 },
        1: { halign: "left", cellWidth: 28 },
        2: { halign: "center", cellWidth: 30 },
        3: { halign: "center", cellWidth: 30 },
        4: { halign: "center", cellWidth: 24 },
        5: { halign: "left", cellWidth: 36 },
        6: { halign: "left", cellWidth: 40 },
        7: { halign: "right", cellWidth: 20 },
      },
      didDrawPage: (hook) => {
        const totalPages = doc.getNumberOfPages();
        const footerY = pageH - 20;
        doc.setDrawColor(220, 225, 235);
        doc.setLineWidth(0.5);
        doc.line(15, footerY - 5, pageW - 15, footerY - 5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(25, 35, 55);
        doc.text(`${empresa} © ${new Date().getFullYear()}`, 15, footerY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text("Relatório de Paradas", 15, footerY + 4);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Página ${hook.pageNumber} de ${totalPages}`,
          pageW - 15,
          footerY + 4,
          {
            align: "right",
          }
        );
      },
    });

    const ts = new Date().toISOString().slice(0, 10);
    doc.save(`relatorio-paradas_${ts}.pdf`);
  }

  // ==== categorias dependentes do tipo selecionado ====
  const categoriaOpts = useMemo(() => {
    if (!tipo) return CATEGORIA_OPTIONS;
    return CATEGORIA_OPTIONS.filter((c) => c.tipo === "" || c.tipo === tipo);
  }, [tipo]);

  useEffect(() => {
    // se trocar o tipo e a categoria atual não for compatível, limpa
    if (categoria && !categoriaOpts.find((o) => o.value === categoria)) {
      setCategoria("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  return (
    <Layout requireAuth={true}>
      <div className={styles.wrap}>
        <div className={styles.topbar}>
          <div>
            <h2 className={styles.title}>Relatório — Paradas por período</h2>
            <p className={styles.subtitle}>{empresa}</p>
          </div>
          <div className={styles.actionsRight}>
            {canExportPdf && (
              <button
                className={styles.ghostBtn}
                onClick={exportPDF}
                disabled={isLoading}
                title="Exportar PDF"
              >
                Exportar PDF
              </button>
            )}
          </div>
        </div>

        {/* Filtros */}
        <div className={`card ${styles.filtersCard}`}>
          <div className={styles.filters}>
            <div className={styles.field}>
              <label>Início</label>
              <input
                type="date"
                className={styles.input}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Fim</label>
              <input
                type="date"
                className={styles.input}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Tipo</label>
              <select
                className={styles.input}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as "" | ParadaTipo)}
              >
                {TIPO_OPTIONS.map((o) => (
                  <option key={o.label} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Categoria</label>
              <select
                className={styles.input}
                value={categoria || ""}
                onChange={(e) =>
                  setCategoria(e.target.value as "" | ParadaCategoria)
                }
              >
                {categoriaOpts.map((o) => (
                  <option key={`${o.tipo}-${o.value}`} value={o.value || ""}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Máquina</label>
              <select
                className={styles.input}
                value={maquinaId}
                onChange={(e) => setMaquinaId(e.target.value)}
              >
                <option value="">Todas</option>
                {(maq?.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome} ({m.codigo})
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Seção</label>
              <select
                className={styles.input}
                value={secaoId}
                onChange={(e) => setSecaoId(e.target.value)}
              >
                <option value="">Todas</option>
                {(sec?.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} ${styles.grow}`}>
              <label>Busca (motivo, máquina…)</label>
              <input
                className={styles.input}
                placeholder="Ex.: falha elétrica, torno, corte…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <button
              className={styles.primaryBtn}
              onClick={() => mutate()}
              disabled={isLoading}
            >
              Aplicar
            </button>
          </div>
        </div>

        {/* Bloqueio por permissão */}
        {blockView && (
          <div className="card" style={{ padding: 16 }}>
            <strong>Sem acesso ao Relatório de Paradas.</strong>
            <div style={{ opacity: 0.7, marginTop: 6 }}>
              Solicite ao administrador permissão de visualização.
            </div>
          </div>
        )}

        {!blockView && (
          <>
            {/* Resumo */}
            <section className={styles.kpis}>
              <div className={`${styles.kpi} ${styles.kpiBlue}`}>
                <span className={styles.kpiLabel}>Paradas</span>
                <strong className={styles.kpiValue}>
                  {resumo.totalParadas}
                </strong>
                <span className={styles.kpiHint}>no período</span>
              </div>
              <div className={`${styles.kpi} ${styles.kpiGreen}`}>
                <span className={styles.kpiLabel}>Tempo total</span>
                <strong className={styles.kpiValue}>
                  {fmtMinutes(resumo.totalMin)}
                </strong>
                <span className={styles.kpiHint}>somando todas</span>
              </div>
              <div className={`${styles.kpi} ${styles.kpiAmber}`}>
                <span className={styles.kpiLabel}>Operacionais</span>
                <strong className={styles.kpiValue}>
                  {fmtMinutes(resumo.opMin)}
                </strong>
                <span className={styles.kpiHint}>tempo</span>
              </div>
              <div className={`${styles.kpi} ${styles.kpiRose}`}>
                <span className={styles.kpiLabel}>Não-operacionais</span>
                <strong className={styles.kpiValue}>
                  {fmtMinutes(resumo.nopMin)}
                </strong>
                <span className={styles.kpiHint}>tempo</span>
              </div>
            </section>

            {/* Tabela */}
            <div className="card">
              {isLoading ? (
                <div className={styles.loading}>Carregando…</div>
              ) : rows.length === 0 ? (
                <div className={styles.empty}>
                  Sem registros no período selecionado.
                </div>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Máquina</th>
                        <th>Seção</th>
                        <th>Início</th>
                        <th>Fim</th>
                        <th>Tipo</th>
                        <th>Categoria</th>
                        <th>Motivo</th>
                        <th>Duração</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => {
                        const minutos = minutesBetween(
                          p.horaInicio,
                          p.horaFinalizacao
                        );
                        const isOp = p.tipo === "OPERACIONAL";
                        const isNop = p.tipo === "NAO_OPERACIONAL";
                        const tipoLabel = labelTipo(p.tipo);

                        return (
                          <tr key={p.id}>
                            <td>
                              {p.maquina?.nome ?? "-"}{" "}
                              <span className={styles.dim}>
                                {p.maquina?.codigo
                                  ? `(${p.maquina.codigo})`
                                  : ""}
                              </span>
                            </td>
                            <td>{p.maquina?.secao?.nome ?? "-"}</td>
                            <td>{new Date(p.horaInicio).toLocaleString()}</td>
                            <td>
                              {p.horaFinalizacao
                                ? new Date(p.horaFinalizacao).toLocaleString()
                                : "—"}
                            </td>
                            <td>
                              <span
                                className={`${styles.badge} ${
                                  isNop
                                    ? styles.badgeNop
                                    : isOp
                                    ? styles.badgeOp
                                    : ""
                                }`}
                              >
                                {tipoLabel}
                              </span>
                            </td>
                            <td className={styles.trunc}>
                              {labelCategoria(p.categoria)}
                            </td>
                            <td className={styles.trunc}>{p.motivo}</td>
                            <td className={styles.num}>
                              {fmtMinutes(minutos)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
