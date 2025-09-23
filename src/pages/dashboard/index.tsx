// pages/dashboard/index.tsx
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import useSWR from "swr";
import Link from "next/link";
import Chart from "chart.js/auto";

// ==== PDF ====
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ==== Permissões ====
import {
  hasPermission,
  type PermissionAction,
  type Role,
} from "../../utils/permissions";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type KPIs = {
  maquinasAtivas: number;
  paradasAbertas: number;
  mttrMin: number;
  disponibilidadePct: number;
  mttrDelta?: number;
  dispDelta?: number;
};

type ChartsPayload = {
  downtimePerDay: { day: string; minutes: number }[];
  paradasPorMotivo: { motivo: string; qtd: number }[];
  paradasPorSecao: { secao: string; qtd: number }[];
};

type RangeKey = "7d" | "30d" | "90d" | "custom";

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Gate que garante ordem estável de hooks */
function DashboardGate() {
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });

  // Enquanto a sessão não chegou, não chamamos nenhum outro hook
  if (!sess) {
    return (
      <Layout requireAuth={true}>
        <div className={`card ${styles.loadingCard}`} style={{ marginTop: 16 }}>
          Carregando…
        </div>
      </Layout>
    );
  }

  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (action: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "dashboard", action);

  // Sem acesso -> retorna cedo (ainda sem criar outros hooks)
  if (!can("view")) {
    return (
      <Layout requireAuth={true}>
        <div className={`card ${styles.errCard}`} role="alert">
          <strong>Sem acesso ao Dashboard.</strong>
          <div className={styles.errActions}>
            <Link href="/" className={styles.ghostBtn}>
              Voltar ao início
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  // Autorizado -> entra no conteúdo que usa os demais hooks
  return <DashboardInner sess={sess} />;
}

export default function Dashboard() {
  return <DashboardGate />;
}

/** Conteúdo real do Dashboard (só renderiza para quem pode ver) */
function DashboardInner({ sess }: { sess: any }) {
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (action: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "dashboard", action);

  const canExportPdf = useMemo(
    () => can("exportPdf"),
    [myRole, sess?.user?.permissoes]
  );

  // ---------------- Período / Filtro ----------------
  const [range, setRange] = useState<RangeKey>("30d");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const qp = useMemo(() => {
    if (range === "custom" && from && to) {
      return `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    return `?range=${range}`;
  }, [range, from, to]);

  const kpisUrl = useMemo(() => `/api/dashboard/kpis${qp}`, [qp]);
  const chartsUrl = useMemo(() => `/api/dashboard/charts${qp}`, [qp]);

  // ---------------- SWR (KPIs/Charts) ----------------
  const {
    data: kpisRes,
    error: kpisErr,
    isLoading: loadingKpis,
    mutate: refetchKpis,
  } = useSWR<{ data: KPIs }>(kpisUrl, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const {
    data: chartsRes,
    error: chartsErr,
    isLoading: loadingCharts,
    mutate: refetchCharts,
  } = useSWR<{ data: ChartsPayload }>(chartsUrl, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const kpis = kpisRes?.data;
  const charts = chartsRes?.data;

  // ---------------- Nome da Fábrica (tenant) ----------------
  const sessionTenantName: string | undefined =
    sess?.user?.tenantName || sess?.tenantName || sess?.user?.tenant?.name;

  const tinyStart = `${todayISO()}T00:00:00`;
  const tinyEnd = `${todayISO()}T00:00:01`;
  const tinyParadasUrl = useMemo(
    () =>
      `/api/relatorios/paradas?startDate=${encodeURIComponent(
        tinyStart
      )}&endDate=${encodeURIComponent(tinyEnd)}&status=todos`,
    [tinyStart, tinyEnd]
  );

  const { data: tinyParadasRes } = useSWR<{ ok: boolean; tenantName?: string }>(
    sessionTenantName ? null : tinyParadasUrl,
    fetcher,
    { revalidateOnFocus: false }
  );

  const tenantName =
    sessionTenantName || tinyParadasRes?.tenantName || "Sua Fábrica";

  // ---------------- Charts refs ----------------
  const lineRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLCanvasElement>(null);
  const pieRef = useRef<HTMLCanvasElement>(null);

  // ---------------- Render dos charts ----------------
  useEffect(() => {
    if (!charts) return;
    const disposers: Array<() => void> = [];
    const dpi = Math.min(window.devicePixelRatio || 1, 1.5);

    const commonPlugins = {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(ctx: any) {
            const lab = ctx.dataset?.label || "";
            const v = ctx.parsed.y ?? ctx.parsed;
            return `${lab}: ${Math.round(v)} min`;
          },
        },
      },
      decimation: { enabled: true, algorithm: "lttb" as const },
    };

    // LINE
    if (lineRef.current) {
      const ctx = lineRef.current.getContext("2d")!;
      const c = new Chart(ctx, {
        type: "line",
        data: {
          labels: charts.downtimePerDay.map((d) => d.day),
          datasets: [
            {
              label: "Minutos de parada/dia",
              data: charts.downtimePerDay.map((d) => Math.round(d.minutes)),
              tension: 0.35,
              fill: true,
              borderWidth: 2,
              pointRadius: 0,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          devicePixelRatio: dpi,
          interaction: { mode: "index", intersect: false },
          layout: { padding: 4 },
          plugins: commonPlugins as any,
          scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
            y: { grid: { color: "rgba(0,0,0,.08)" }, ticks: { precision: 0 } },
          },
        },
      });
      disposers.push(() => c.destroy());
    }

    // BAR
    if (barRef.current) {
      const ctx = barRef.current.getContext("2d")!;
      const c = new Chart(ctx, {
        type: "bar",
        data: {
          labels: charts.paradasPorMotivo.map((d) => d.motivo),
          datasets: [
            {
              label: "Paradas por motivo (período)",
              data: charts.paradasPorMotivo.map((d) => d.qtd),
              borderWidth: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          devicePixelRatio: dpi,
          interaction: { mode: "index", intersect: false },
          layout: { padding: 4 },
          plugins: {
            ...commonPlugins,
            tooltip: {
              callbacks: {
                label(ctx: any) {
                  const v = ctx.parsed.y ?? ctx.parsed;
                  return `Ocorrências: ${v}`;
                },
              },
            },
          } as any,
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: "rgba(0,0,0,.08)" }, ticks: { precision: 0 } },
          },
          onClick: (_e, els, chart) => {
            const idx = (els as any)[0]?.index;
            if (idx == null) return;
            const motivo = chart.data.labels?.[idx];
            if (motivo) {
              window.location.href = `/operacao?motivo=${encodeURIComponent(
                String(motivo)
              )}`;
            }
          },
        },
      });
      disposers.push(() => c.destroy());
    }

    // PIE
    if (pieRef.current) {
      const ctx = pieRef.current.getContext("2d")!;
      const totals = charts.paradasPorSecao.reduce((s, x) => s + x.qtd, 0);
      const c = new Chart(ctx, {
        type: "pie",
        data: {
          labels: charts.paradasPorSecao.map((d) => d.secao),
          datasets: [
            {
              label: "Paradas por seção (período)",
              data: charts.paradasPorSecao.map((d) => d.qtd),
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          devicePixelRatio: dpi,
          layout: { padding: 4 },
          plugins: {
            legend: {
              position: "bottom",
              labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } },
            },
            tooltip: {
              callbacks: {
                label(ctx: any) {
                  const v = ctx.parsed;
                  const pct = totals ? ((v / totals) * 100).toFixed(1) : "0.0";
                  const lab = ctx.label ?? "";
                  return `${lab}: ${v} (${pct}%)`;
                },
              },
            },
          } as any,
        },
      });
      disposers.push(() => c.destroy());
    }

    return () => disposers.forEach((fn) => fn());
  }, [charts]);

  // ---------------- Utils: exportações ----------------
  function download(filename: string, content: string, type = "text/csv") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    if (!charts) return;
    const b1 = [
      "downtimePerDay",
      "day,minutes",
      ...charts.downtimePerDay.map((d) => `${d.day},${Math.round(d.minutes)}`),
    ].join("\n");
    const b2 = [
      "",
      "paradasPorMotivo",
      "motivo,qtd",
      ...charts.paradasPorMotivo.map(
        (d) => `"${d.motivo.replace(/"/g, '""')}",${d.qtd}`
      ),
    ].join("\n");
    const b3 = [
      "",
      "paradasPorSecao",
      "secao,qtd",
      ...charts.paradasPorSecao.map(
        (d) => `"${d.secao.replace(/"/g, '""')}",${d.qtd}`
      ),
    ].join("\n");
    download(`dashboard_${range}.csv`, [b1, b2, b3].join("\n"));
  }

  function exportPNG(ref: RefObject<HTMLCanvasElement>, name: string) {
    const el = ref.current;
    if (!el) return;
    const url = el.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.png`;
    a.click();
  }

  // -------- Helpers PDF --------
  async function getImageBase64(url: string): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onloadend = () =>
          typeof r.result === "string"
            ? resolve(r.result)
            : reject(new Error("fail"));
        r.onerror = () => reject(new Error("fail"));
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function kpiRowsForPdf(k?: KPIs) {
    return [
      ["Máquinas ativas", String(k?.maquinasAtivas ?? 0)],
      ["Paradas abertas", String(k?.paradasAbertas ?? 0)],
      ["MTTR (min)", String(k?.mttrMin ?? 0)],
      ["Disponibilidade (%)", String(k?.disponibilidadePct ?? 100)],
    ];
  }

  async function exportDashboardPDF() {
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

    try {
      const logo = await getImageBase64("/imagens/logo.png");
      if (logo) doc.addImage(logo, "PNG", 16, 7, 16, 16);
    } catch {}

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 190, 210);
    doc.text((tenantName || "").toUpperCase(), 8, 25);
    doc.setFontSize(7);
    doc.text("Relatórios Operacionais", 9, 28);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("DASHBOARD — RELATÓRIO", pageW / 2, 18, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(218, 165, 32);
    doc.text((tenantName || "SUA FÁBRICA").toUpperCase(), pageW / 2, 28, {
      align: "center",
    });

    const agora = new Date();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 190, 210);
    doc.text(
      `Gerado em ${agora.toLocaleDateString(
        "pt-BR"
      )} ${agora.toLocaleTimeString("pt-BR")}`,
      pageW - 5,
      28,
      { align: "right" }
    );

    let y = 55;

    // Box de período
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(220, 225, 235);
    doc.setLineWidth(0.5);
    doc.rect(15, y, pageW - 30, 16, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 85);
    doc.text("PERÍODO", 20, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const rangeText =
      range === "custom" && from && to
        ? `De ${from} até ${to}`
        : range === "7d"
        ? "Últimos 7 dias"
        : range === "90d"
        ? "Últimos 90 dias"
        : "Últimos 30 dias";
    doc.text(rangeText, 20, y + 12);
    y += 25;

    // Tabela KPIs
    autoTable(doc, {
      startY: y,
      head: [["Indicador", "Valor"]],
      body: kpiRowsForPdf(kpis),
      theme: "plain",
      margin: { left: 15, right: 15, bottom: 30 },
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
        lineColor: [230, 235, 245],
        lineWidth: 0.3,
        halign: "left",
        valign: "middle",
        textColor: [55, 65, 85],
      },
      headStyles: {
        fillColor: [25, 35, 55],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
        cellPadding: { top: 5, bottom: 5, left: 3, right: 3 },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    y = (doc as any).lastAutoTable.finalY + 8;

    // Linha decorativa
    doc.setDrawColor(218, 165, 32);
    doc.setLineWidth(1);
    doc.line(14, y, pageW - 15, y);
    y += 6;

    // Gráficos
    const chartBoxH = 80;
    const chartMarginX = 15;
    const chartW = pageW - chartMarginX * 2;

    const chartsToAdd: Array<{
      title: string;
      ref: RefObject<HTMLCanvasElement>;
    }> = [
      { title: "Parada por dia", ref: lineRef },
      { title: "Paradas por motivo", ref: barRef },
      { title: "Paradas por seção", ref: pieRef },
    ];

    for (const item of chartsToAdd) {
      const el = item.ref.current;
      if (!el) continue;

      if (y + chartBoxH + 30 > pageH) {
        doc.addPage();
        y = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(25, 35, 55);
      doc.text(item.title, chartMarginX, y);
      y += 4;

      try {
        const dataURL = el.toDataURL("image/png");
        doc.addImage(dataURL, "PNG", chartMarginX, y, chartW, chartBoxH);
      } catch {}
      y += chartBoxH + 8;
    }

    // Rodapé
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const footerY = doc.internal.pageSize.getHeight() - 20;
      doc.setDrawColor(220, 225, 235);
      doc.setLineWidth(0.5);
      doc.line(15, footerY - 5, pageW - 15, footerY - 5);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(25, 35, 55);
      doc.text(`${tenantName} © ${new Date().getFullYear()}`, 15, footerY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text("Relatório do Dashboard", 15, footerY + 4);

      doc.setTextColor(100, 116, 139);
      doc.text(`Página ${i} de ${pageCount}`, pageW - 15, footerY + 4, {
        align: "right",
      });
    }

    const ts = new Date().toISOString().slice(0, 10);
    doc.save(`dashboard_${ts}.pdf`);
  }

  // ---------------- Disponibilidade: cor ----------------
  const disponibilidade = kpis?.disponibilidadePct ?? 100;
  const dispClass =
    disponibilidade >= 95
      ? styles.good
      : disponibilidade >= 85
      ? styles.warn
      : styles.bad;

  // ---------------- UI ----------------

  // 🔽 Coloque a função aqui, antes do return
  function fmtHHMMFromMinutes(totalMin: number) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60; // resto certinho
    return `${h}:${m.toString().padStart(2, "0")}`;
  }

  return (
    <Layout requireAuth={true}>
      <div className={styles.root}>
        {/* Topo / filtros */}
        <div className={styles.topbar}>
          <div className={styles.titleWrap}>
            <div className={styles.tenantName}>{tenantName}</div>
            <h1>Dashboard</h1>
            <span className={styles.hint}>
              KPIs e gráficos com atualização automática.
            </span>
          </div>

          <div className={styles.filters}>
            <div
              className={styles.rangeTabs}
              role="tablist"
              aria-label="Período"
            >
              {(["7d", "30d", "90d"] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={range === r}
                  className={`${styles.tab} ${
                    range === r ? styles.active : ""
                  }`}
                  onClick={() => setRange(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
              <button
                role="tab"
                aria-selected={range === "custom"}
                className={`${styles.tab} ${
                  range === "custom" ? styles.active : ""
                }`}
                onClick={() => setRange("custom")}
              >
                Personalizado
              </button>
            </div>

            {range === "custom" && (
              <div className={styles.dateInputs}>
                <label className={styles.labelSmall}>
                  De
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className={styles.labelSmall}>
                  Até
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>

                <button
                  className={styles.ghostBtn}
                  onClick={() => {
                    if (!from || !to) return;
                    refetchKpis();
                    refetchCharts();
                  }}
                >
                  Aplicar
                </button>
              </div>
            )}

            {/* Exportar PDF (visível só com permissão) */}
            {canExportPdf && (
              <button
                className={styles.ghostBtn}
                onClick={exportDashboardPDF}
                title="Exportar PDF"
              >
                Exportar PDF
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <section className={styles.kpis} aria-live="polite">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${styles.kpi} card`}>
              {loadingKpis ? (
                <div className={styles.kpiSkeleton} />
              ) : i === 0 ? (
                <>
                  <span className={styles.kpiLabel}>Máquinas</span>
                  <strong className={styles.kpiValue}>
                    {kpis?.maquinasAtivas ?? 0}
                  </strong>
                  <span className={styles.kpiHint}>Ativas cadastradas</span>
                </>
              ) : i === 1 ? (
                <>
                  <span className={styles.kpiLabel}>Paradas abertas</span>
                  <strong className={styles.kpiValue}>
                    {kpis?.paradasAbertas ?? 0}
                  </strong>
                  <span className={styles.kpiHint}>
                    <Link href="/operacao" className={styles.kpiLink}>
                      Ver na Operação
                    </Link>
                  </span>
                </>
              ) : i === 2 ? (
                <>
                  <span className={styles.kpiLabel}>MTTR</span>
                  <strong className={styles.kpiValue}>
                    {fmtHHMMFromMinutes(kpis?.mttrMin ?? 0)}
                    <small> h</small>
                  </strong>
                  {typeof kpis?.mttrDelta === "number" && (
                    <span
                      className={`${styles.trend} ${
                        kpis.mttrDelta <= 0 ? styles.trendUp : styles.trendDown
                      }`}
                    >
                      {kpis.mttrDelta > 0 ? "+" : ""}
                      {kpis.mttrDelta}% vs período anterior
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className={styles.kpiLabel}>Disponibilidade</span>
                  <strong className={`${styles.kpiValue} ${dispClass}`}>
                    {kpis?.disponibilidadePct ?? 100}%
                  </strong>
                  {typeof kpis?.dispDelta === "number" && (
                    <span
                      className={`${styles.trend} ${
                        (kpis.dispDelta ?? 0) >= 0
                          ? styles.trendUp
                          : styles.trendDown
                      }`}
                    >
                      {(kpis.dispDelta ?? 0) >= 0 ? "+" : ""}
                      {kpis.dispDelta} p.p.
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </section>

        {/* Erros */}
        {(kpisErr || chartsErr) && (
          <div className={`card ${styles.errCard}`} role="alert">
            <strong>Falha ao carregar dados.</strong>
            <div className={styles.errActions}>
              <button
                className={styles.ghostBtn}
                onClick={() => {
                  refetchKpis();
                  refetchCharts();
                }}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* Gráficos */}
        <section className={styles.grid}>
          <article className="card">
            <header className={styles.cardHead}>
              <h3>Parada por dia ({range === "custom" ? "período" : range})</h3>
              <div className={styles.cardActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => exportPNG(lineRef, "parada_por_dia")}
                  aria-label="Exportar PNG"
                >
                  PNG
                </button>
                <button
                  className={styles.ghostBtn}
                  onClick={exportCSV}
                  aria-label="Exportar CSV"
                >
                  CSV
                </button>
              </div>
            </header>
            <div className={styles.chartBox}>
              {loadingCharts ? (
                <div className={styles.chartSkeleton} />
              ) : charts?.downtimePerDay?.length ? (
                <canvas
                  ref={lineRef}
                  role="img"
                  aria-label="Minutos de parada por dia"
                />
              ) : (
                <div className={styles.empty}>Sem dados no período.</div>
              )}
            </div>
          </article>

          <article className="card">
            <header className={styles.cardHead}>
              <h3>
                Paradas por motivo ({range === "custom" ? "período" : range})
              </h3>
              <div className={styles.cardActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => exportPNG(barRef, "paradas_por_motivo")}
                >
                  PNG
                </button>
                <button className={styles.ghostBtn} onClick={exportCSV}>
                  CSV
                </button>
              </div>
            </header>
            <div className={styles.chartBox}>
              {loadingCharts ? (
                <div className={styles.chartSkeleton} />
              ) : charts?.paradasPorMotivo?.length ? (
                <canvas
                  ref={barRef}
                  role="img"
                  aria-label="Paradas por motivo"
                />
              ) : (
                <div className={styles.empty}>Sem dados no período.</div>
              )}
            </div>
          </article>

          <article className="card">
            <header className={styles.cardHead}>
              <h3>
                Paradas por seção ({range === "custom" ? "período" : range})
              </h3>
              <div className={styles.cardActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => exportPNG(pieRef, "paradas_por_secao")}
                >
                  PNG
                </button>
                <button className={styles.ghostBtn} onClick={exportCSV}>
                  CSV
                </button>
              </div>
            </header>
            <div className={styles.chartBox}>
              {loadingCharts ? (
                <div className={styles.chartSkeleton} />
              ) : charts?.paradasPorSecao?.length ? (
                <canvas
                  ref={pieRef}
                  role="img"
                  aria-label="Paradas por seção"
                />
              ) : (
                <div className={styles.empty}>Sem dados no período.</div>
              )}
            </div>
          </article>
        </section>
      </div>
    </Layout>
  );
}
