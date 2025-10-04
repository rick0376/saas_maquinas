// pages/paradas/[id]/editar/index.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import useSWR, { mutate } from "swr";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Save,
  X,
  CheckCircle2,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Check,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Maquina = { id: string; codigo: string; nome: string };
type Parada = {
  id: string;
  motivo: string;
  horaInicio: string;
  horaFinalizacao?: string | null;
  equipeAtuando?: string | null;
  observacao?: string | null;
  tempoIntervencao?: number | null;
  maquina?: Maquina | null;
};

// Util: ISO -> input datetime-local (YYYY-MM-DDTHH:mm)
function toLocalDT(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
// Util: input datetime-local -> ISO (ou null)
function fromLocalDT(val: string) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function EditParadaPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  // Parada
  const { data, isLoading } = useSWR<{ data: Parada }>(
    id ? `/api/paradas/${id}` : null,
    fetcher
  );
  const p = data?.data;

  // Nome do cliente/fábrica (tenant)
  const { data: tinfo } = useSWR<
    | { ok: true; tenantName: string; tenantId: string | null; super: boolean }
    | undefined
  >("/api/utils/tenant-name", fetcher);

  // Form state
  const [form, setForm] = useState({
    motivo: "",
    equipeAtuando: "",
    observacao: "",
    horaInicio: "",
    horaFinalizacao: "",
  });
  const finalizada = useMemo(
    () => Boolean(p?.horaFinalizacao),
    [p?.horaFinalizacao]
  );

  // Modal excluir
  const [showDel, setShowDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Modal de confirmação genérica (para “desfazer” com conflito)
  const [confirm, setConfirm] = useState<{
    open: boolean;
    message: string;
    onYes?: () => void;
  }>({ open: false, message: "" });

  // Carrega form quando a parada chegar
  useEffect(() => {
    if (!p) return;
    setForm({
      motivo: p.motivo ?? "",
      equipeAtuando: p.equipeAtuando ?? "",
      observacao: p.observacao ?? "",
      horaInicio: toLocalDT(p.horaInicio),
      horaFinalizacao: toLocalDT(p.horaFinalizacao ?? undefined),
    });
  }, [p]);

  // Se não houver id, volta para listagem
  useEffect(() => {
    if (router.isReady && !id) {
      router.replace("/paradas");
    }
  }, [router, id]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    const payload = {
      motivo: form.motivo.trim(),
      equipeAtuando: form.equipeAtuando.trim() || null,
      observacao: form.observacao.trim() || null,
      horaInicio: fromLocalDT(form.horaInicio),
      horaFinalizacao: fromLocalDT(form.horaFinalizacao),
    };

    const r = await fetch(`/api/paradas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      mutate(`/api/paradas/${id}`);
      mutate("/paradas"); // caso exista alguma chave local
      router.push("/paradas");
    } else {
      alert("Falha ao salvar.");
    }
  }

  async function finalizar() {
    if (!id) return;
    const r = await fetch(`/api/paradas/${id}/finalizar`, { method: "POST" });
    if (r.ok) {
      mutate(`/api/paradas/${id}`);
      mutate("/paradas");
      router.push("/paradas");
    } else {
      alert("Falha ao finalizar.");
    }
  }

  async function postDesfazer(paradaId: string, ignoreOpen = false) {
    const q = ignoreOpen ? "?ignoreOpen=1" : "";
    const urls = [
      `/api/paradas/${encodeURIComponent(paradaId)}/desfazer${q}`,
      `/api/paradas/${encodeURIComponent(paradaId)}/reabrir${q}`,
    ];

    let lastMessage = "Falha ao desfazer a finalização.";
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: paradaId, ignoreOpen }),
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {}

        if (res.ok) return { ok: true as const };

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

        if (res.status === 404) {
          lastMessage =
            data?.message || data?.error || "Parada não encontrada.";
          continue; // tenta a outra rota
        }

        lastMessage =
          data?.message ||
          data?.error ||
          `Falha ao desfazer (HTTP ${res.status}).`;
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
    if (!id) return;
    const result = await postDesfazer(id, false);
    if (!result.ok && result.conflict) {
      setConfirm({
        open: true,
        message:
          result.message ||
          "Já existe uma parada em aberto para esta máquina. Deseja reabrir assim mesmo?",
        onYes: async () => {
          setConfirm({ open: false, message: "" });
          const retry = await postDesfazer(id, true);
          if (!retry.ok) {
            alert(retry.message || "Falha ao desfazer a finalização.");
            return;
          }
          mutate(`/api/paradas/${id}`);
          mutate("/paradas");
          router.push("/paradas");
        },
      });
      return;
    }
    if (!result.ok) {
      alert(result.message || "Falha ao desfazer finalização.");
      return;
    }
    mutate(`/api/paradas/${id}`);
    mutate("/paradas");
    router.push("/paradas");
  }

  async function excluir() {
    if (!id) return;
    setDeleting(true);
    const r = await fetch(`/api/paradas/${id}`, { method: "DELETE" });
    setDeleting(false);
    setShowDel(false);
    if (r.ok) {
      mutate("/paradas");
      router.push("/paradas");
    } else {
      alert("Falha ao excluir.");
    }
  }

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <h1>
          Editar Parada{" "}
          {tinfo?.tenantName && (
            <span className={styles.dim}>— {tinfo.tenantName}</span>
          )}
        </h1>
        <div className={styles.actionsRight}>
          <Link href="/paradas" className={styles.ghostBtn}>
            <X size={16} />
            Cancelar
          </Link>
          <button className={styles.dangerBtn} onClick={() => setShowDel(true)}>
            <Trash2 size={16} />
            Excluir
          </button>
        </div>
      </div>

      <div className="card">
        {isLoading || !p ? (
          <div className={styles.empty}>Carregando…</div>
        ) : (
          <form className={styles.form} onSubmit={onSave}>
            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.label}>Máquina</label>
                <div className={styles.readonly}>
                  {p.maquina?.nome ?? "—"}{" "}
                  {p.maquina?.codigo && (
                    <span className={styles.dim}>({p.maquina.codigo})</span>
                  )}
                </div>
              </div>
              <div className={styles.col}>
                <label className={styles.label}>Status</label>
                <div className={styles.readonly}>
                  {finalizada ? "Finalizada" : "Em andamento"}
                </div>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.col}>
                <label className={styles.label}>Motivo</label>
                <input
                  className={styles.input}
                  value={form.motivo}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, motivo: e.target.value }))
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
                <label className={styles.label}>Finalização</label>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={form.horaFinalizacao}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      horaFinalizacao: e.target.value,
                    }))
                  }
                  placeholder="Opcional (ou use o botão Finalizar)"
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.colFull}>
                <label className={styles.label}>Observação</label>
                <textarea
                  className={`${styles.input} ${styles.textarea}`}
                  value={form.observacao}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, observacao: e.target.value }))
                  }
                  placeholder="Anotações gerais (opcional)"
                  rows={5}
                />
              </div>
            </div>

            <div className={styles.actions}>
              <button className={styles.primaryBtn} type="submit">
                <Save size={16} />
                Salvar
              </button>

              {!finalizada ? (
                <button
                  className={styles.successBtn}
                  type="button"
                  onClick={finalizar}
                >
                  <CheckCircle2 size={16} />
                  Finalizar
                </button>
              ) : (
                <button
                  className={styles.ghostBtn}
                  type="button"
                  onClick={desfazerFinalizacao}
                >
                  <RotateCcw size={16} />
                  Desfazer finalização
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Modal excluir */}
      {showDel && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setShowDel(false)}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delTitleEdit"
          >
            <div className={styles.modalCard}>
              <div className={styles.modalIcon}>
                <AlertTriangle size={18} />
              </div>
              <h4 id="delTitleEdit" className={styles.modalTitle}>
                Excluir parada?
              </h4>
              <p className={styles.modalText}>
                Esta ação não pode ser desfeita.
              </p>
              <div className={styles.modalActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => setShowDel(false)}
                >
                  <X size={14} /> Cancelar
                </button>
                <button
                  className={styles.dangerBtn}
                  onClick={excluir}
                  disabled={deleting}
                >
                  <Check size={14} /> {deleting ? "Excluindo…" : "Excluir"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmação genérica (desfazer com outra parada aberta) */}
      {confirm.open && (
        <>
          <div
            className={styles.modalOverlay}
            onClick={() => setConfirm({ open: false, message: "" })}
          />
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmTitle"
          >
            <div className={styles.modalCard}>
              <h4 id="confirmTitle" className={styles.modalTitle}>
                Confirmar ação
              </h4>
              <p className={styles.modalText} style={{ marginTop: 8 }}>
                {confirm.message}
              </p>
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => setConfirm({ open: false, message: "" })}
                >
                  <X size={14} /> Cancelar
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
        </>
      )}
    </Layout>
  );
}
