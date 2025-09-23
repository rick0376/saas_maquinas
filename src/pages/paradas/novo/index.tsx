// pages/paradas/nova.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import useSWR from "swr";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import { Save, X, AlertTriangle, Check, BadgeCheck } from "lucide-react";
import { useRouter } from "next/router";

// Função para buscar dados da API
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Tipos
type Maquina = { id: string; codigo: string; nome: string };
type ParadaTipo = "OPERACIONAL" | "NAO_OPERACIONAL";
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
  | "OUTROS_NAO_OPERACIONAL";

// Helpers
function nowLocalDT() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function fromLocalDT(val: string) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Categorias
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
const CATEGORIAS_NAO_OPERACIONAIS: { key: ParadaCategoria; label: string }[] = [
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

export default function NovaParadaPage() {
  const router = useRouter();

  // Tenant
  const { data: tinfo } = useSWR<{
    ok: true;
    tenantName: string;
    tenantId: string | null;
    super: boolean;
  }>("/api/utils/tenant-name", fetcher);

  // Máquinas
  const { data: maqRes } = useSWR<{ data: Maquina[] }>(
    "/api/maquinas",
    fetcher
  );
  const maquinas = maqRes?.data ?? [];

  // Formulário
  const [form, setForm] = useState({
    maquinaId: "",
    tipo: "OPERACIONAL" as ParadaTipo,
    categoria: CATEGORIAS_OPERACIONAIS[0].key,
    motivo: "",
    equipeAtuando: "",
    observacao: "",
    horaInicio: nowLocalDT(),
  });

  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [openConflict, setOpenConflict] = useState<{
    message: string;
    payload: typeof form;
  } | null>(null);

  // Pré-seleciona a primeira máquina
  useEffect(() => {
    if (!form.maquinaId && maquinas.length > 0) {
      setForm((s) => ({ ...s, maquinaId: maquinas[0].id }));
    }
  }, [maquinas]);

  const selectedMachine = useMemo(
    () => maquinas.find((m) => m.id === form.maquinaId),
    [maquinas, form.maquinaId]
  );

  const availableCategories =
    form.tipo === "OPERACIONAL"
      ? CATEGORIAS_OPERACIONAIS
      : CATEGORIAS_NAO_OPERACIONAIS;

  // Envio
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.maquinaId || !form.motivo.trim() || submitting) return;
    await createParada(form);
  }

  // Cria parada
  async function createParada(payload: typeof form, ignoreOpen = false) {
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/operacao/paradas/start${ignoreOpen ? "?ignoreOpen=1" : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            horaInicio: fromLocalDT(payload.horaInicio),
            motivo: payload.motivo.trim(),
            equipeAtuando: payload.equipeAtuando.trim() || null,
            observacao: payload.observacao.trim() || null,
          }),
        }
      );
      const js = await response.json().catch(() => ({}));

      // Conflito
      if (response.status === 409 || js?.code === "ALREADY_OPEN") {
        setOpenConflict({
          message:
            js?.error ||
            "Já existe uma parada em aberto para esta máquina. Deseja abrir outra?",
          payload,
        });
        setSubmitting(false);
        return;
      }

      if (!response.ok || !js?.ok)
        throw new Error(js?.error || "Falha ao cadastrar parada.");

      // Sucesso
      setFlash("Parada cadastrada com sucesso!");
      setForm((s) => ({
        ...s,
        motivo: "",
        equipeAtuando: "",
        observacao: "",
        horaInicio: nowLocalDT(),
      }));
      setTimeout(() => {
        setFlash(null);
        router.push("/paradas");
      }, 2000);
    } catch (err: any) {
      alert(err?.message || "Não foi possível cadastrar a parada.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <h1>
          Nova Parada{" "}
          {tinfo?.tenantName && (
            <span className={styles.dim}>— {tinfo.tenantName}</span>
          )}
        </h1>
        <div className={styles.actionsRight}>
          <Link href="/paradas" className={styles.ghostBtn}>
            <X size={16} /> Cancelar
          </Link>
        </div>
      </div>

      {flash && (
        <div className={styles.toastSuccess}>
          <BadgeCheck size={16} /> {flash}
        </div>
      )}

      <div className="card">
        <form className={styles.form} onSubmit={onSubmit}>
          {/* Linha 1 */}
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
              <label className={styles.label}>Motivo</label>
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
          </div>

          {/* Linha 2 */}
          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label}>Tipo</label>
              <div className={styles.segmented}>
                <button
                  type="button"
                  className={`${styles.segBtn} ${
                    form.tipo === "OPERACIONAL" ? styles.segActive : ""
                  }`}
                  onClick={() =>
                    setForm((s) => ({ ...s, tipo: "OPERACIONAL" }))
                  }
                >
                  Operacional
                </button>
                <button
                  type="button"
                  className={`${styles.segBtn} ${
                    form.tipo === "NAO_OPERACIONAL" ? styles.segActive : ""
                  }`}
                  onClick={() =>
                    setForm((s) => ({ ...s, tipo: "NAO_OPERACIONAL" }))
                  }
                >
                  Não Operacional
                </button>
              </div>
            </div>
            <div className={styles.col}>
              <label className={styles.label}>Categoria</label>
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
                {availableCategories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 3 */}
          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label}>Início</label>
              <input
                type="datetime-local"
                className={styles.input}
                value={form.horaInicio}
                onChange={(e) =>
                  setForm((s) => ({ ...s, horaInicio: e.target.value }))
                }
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

          {/* Linha 4 */}
          <div className={styles.row}>
            <div className={styles.col}>
              <label className={styles.label}>Observação</label>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                rows={4}
                value={form.observacao}
                onChange={(e) =>
                  setForm((s) => ({ ...s, observacao: e.target.value }))
                }
                placeholder="Detalhes da ocorrência (opcional)"
              />
            </div>
          </div>

          {selectedMachine && (
            <div className={styles.readonly} style={{ marginTop: ".5rem" }}>
              Selecionada: <strong>{selectedMachine.nome}</strong>{" "}
              <span className={styles.dim}>({selectedMachine.codigo})</span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.primaryBtn}
              type="submit"
              disabled={!form.maquinaId || !form.motivo.trim() || submitting}
            >
              <Save size={16} />
              {submitting ? "Cadastrando…" : "Cadastrar"}
            </button>
          </div>
        </form>
      </div>

      {/* Modal de conflito */}
      {openConflict && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setOpenConflict(null)}
          />
          <div className={styles.modal} role="dialog" aria-modal="true">
            <div className={styles.modalCard}>
              <div className={styles.modalIcon}>
                <AlertTriangle size={20} />
              </div>
              <h4 className={styles.modalTitle}>
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
                — {labelCategoria(openConflict.payload.categoria as any)}
                <br />
                <strong>Motivo:</strong> {openConflict.payload.motivo}
              </p>
              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setOpenConflict(null)}
                >
                  <X size={16} /> Cancelar
                </button>
                <button
                  className={styles.primaryBtn}
                  onClick={() => {
                    createParada(openConflict.payload, true);
                    setOpenConflict(null);
                  }}
                  disabled={submitting}
                >
                  <Check size={16} />{" "}
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
