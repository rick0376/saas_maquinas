// pages/integracoes/whatsapp/index.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Copy, Users, MessageCircle, X } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../../utils/permissions";

type Contato = { id: string; nome: string; celular: string };
type TenantRes =
  | { ok: true; data: { id: string; name: string } | null }
  | { ok: false; message: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/* ===================== Helpers de telefone (BR) ===================== */
function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
function toE164FromLocal(localDigits: string) {
  const d = onlyDigits(localDigits);
  if (!d) return "";
  const with55 = d.startsWith("55") ? d : `55${d}`;
  return `+${with55}`;
}
function prettyFromStored(stored: string) {
  const d = onlyDigits(stored);
  const with55 = d.startsWith("55") ? d : `55${d}`;
  const country = "+55";
  const rest = with55.slice(2);
  const ddd = rest.slice(0, 2);
  const number = rest.slice(2);
  if (!ddd) return country;
  if (number.length >= 9) {
    const n1 = number.slice(0, 5);
    const n2 = number.slice(5, 9);
    return `${country} (${ddd}) ${n1}${n2 ? "-" + n2 : ""}`;
  } else {
    const n1 = number.slice(0, 4);
    const n2 = number.slice(4, 8);
    return `${country} (${ddd}) ${n1}${n2 ? "-" + n2 : ""}`;
  }
}
function maskLocalTyping(localDigits: string) {
  const d = onlyDigits(localDigits).slice(0, 11);
  const ddd = d.slice(0, 2);
  const num = d.slice(2);
  if (!ddd) return "";
  if (num.length > 5) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5, 9)}`;
  if (num.length > 0) return `(${ddd}) ${num}`;
  return `(${ddd}`;
}

/* ===================== Página ===================== */
export default function WhatsappPage() {
  // 🔐 Sessão/Permissões
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "integracoes_whatsapp", a);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canOpenWhatsApp = useMemo(() => can("open_whatsapp"), [sess, myRole]);
  const canCopyLink = useMemo(() => can("copy_link"), [sess, myRole]);

  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <strong>Sem acesso à Integração do WhatsApp.</strong>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Solicite ao administrador a permissão de visualização.
          </div>
        </div>
      </Layout>
    );
  }

  // Contatos do tenant atual (ordenados A→Z)
  const { data } = useSWR<{ data: Contato[] }>("/api/contatos", fetcher, {
    revalidateOnFocus: false,
  });
  const contatos: Contato[] = useMemo(() => {
    const base = data?.data ?? [];
    return base
      .slice()
      .sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
      );
  }, [data?.data]);

  // Nome do cliente/fábrica atual
  const { data: tRes } = useSWR<TenantRes>("/api/tenant/current", fetcher);
  const tenantName =
    (tRes && "ok" in tRes && tRes.ok && tRes.data?.name) || "Sua Empresa";

  // Estados principais
  const [selectedId, setSelectedId] = useState<string>("");
  const [localPhone, setLocalPhone] = useState<string>("");
  const [message, setMessage] = useState<string>(
    "Olá! Teste do SaaS Máquinas ✅"
  );
  const [copied, setCopied] = useState(false);

  // Modais:
  const [showChoiceModal, setShowChoiceModal] = useState(false); // escolha Direct x Broadcast
  const [showHintModal, setShowHintModal] = useState<null | { text: string }>(
    null
  ); // aviso extra quando faltou contato/número ou mensagem

  // Referências para UX (foco)
  const selectContatoRef = useRef<HTMLSelectElement>(null);

  // QRCode Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrType, setQrType] = useState<"direct" | "broadcast">("direct");

  // Número final (E.164)
  const phoneE164 = useMemo(() => {
    const contato = contatos.find((c) => c.id === selectedId);
    if (contato?.celular) {
      const digits = onlyDigits(contato.celular);
      return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
    }
    const manual = toE164FromLocal(localPhone);
    return manual || "";
  }, [contatos, selectedId, localPhone]);

  // Links wa.me (para QR preview)
  const directLink = useMemo(() => {
    if (!phoneE164) return "";
    const phone = onlyDigits(phoneE164);
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }, [phoneE164, message]);

  const broadcastLink = useMemo(() => {
    if (!message.trim()) return "";
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [message]);

  // Link ativo p/ QR (apenas preview/QR)
  const activeLink = qrType === "direct" ? directLink : broadcastLink;

  // Gera QR quando mudar link ativo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeLink || !canvasRef.current) return;
      const QR = (await import("qrcode")).default as any;
      if (cancelled) return;
      QR.toCanvas(canvasRef.current, activeLink, { width: 260 });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeLink]);

  // Fechar modais com ESC e travar scroll
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showHintModal) setShowHintModal(null);
        else if (showChoiceModal) setShowChoiceModal(false);
      }
    };
    document.addEventListener("keydown", onKey);

    const anyOpen = showChoiceModal || showHintModal;
    const prev = document.body.style.overflow;
    if (anyOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = prev || "";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev || "";
    };
  }, [showChoiceModal, showHintModal]);

  // Handlers
  function onSelectContato(id: string) {
    setSelectedId(id);
    if (id) setLocalPhone("");
  }
  function onManualPhoneChange(v: string) {
    setSelectedId("");
    const digits = onlyDigits(v).slice(0, 11);
    setLocalPhone(digits);
  }
  const maskedManual = useMemo(() => maskLocalTyping(localPhone), [localPhone]);

  async function copyLink() {
    if (!canCopyLink || !activeLink) return;
    await navigator.clipboard.writeText(activeLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Sempre habilitado: decisão/validação acontece na modal
  function openWhatsApp() {
    if (!canOpenWhatsApp) return;
    setShowChoiceModal(true);
  }

  // Escolha na primeira modal
  function handleChoice(type: "direct" | "broadcast") {
    if (type === "direct") {
      if (!phoneE164) {
        // fecha a modal de escolha e abre a de aviso
        setShowChoiceModal(false);
        setShowHintModal({
          text: "Selecione um contato na lista ou informe um número manual para envio direto.",
        });
        return;
      }
      const phone = onlyDigits(phoneE164);
      const link = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(link, "_blank", "noopener,noreferrer");
      setShowChoiceModal(false);
      return;
    }

    // broadcast
    if (!message.trim()) {
      setShowChoiceModal(false);
      setShowHintModal({
        text: "Digite uma mensagem para poder usar o modo broadcast (WhatsApp abrirá para você escolher múltiplos contatos).",
      });
      return;
    }
    const link = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(link, "_blank", "noopener,noreferrer");
    setShowChoiceModal(false);
  }

  // Ao fechar a modal de aviso, foca no select para facilitar
  function closeHintAndFocus() {
    setShowHintModal(null);
    // foca no select de contato para o usuário já escolher
    requestAnimationFrame(() => {
      selectContatoRef.current?.focus();
    });
  }

  return (
    <Layout requireAuth={true}>
      <div className={styles.wrap}>
        <header className={styles.topbar}>
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>
              Integrações · WhatsApp{" "}
              <span className={styles.dim} title="Cliente/Fábrica em uso">
                — {tenantName}
              </span>
            </h1>
            <p className={styles.subtitle}>
              Gere um QR e/ou abra o WhatsApp com mensagem pré-preenchida.
            </p>
          </div>
        </header>

        <section className={`card ${styles.card}`}>
          <header className={styles.cardHead}>
            <h3>Configuração da Mensagem</h3>
          </header>

          <div className={styles.formGrid}>
            <div className={styles.col}>
              <label className={styles.label}>Selecionar contato</label>
              <select
                ref={selectContatoRef}
                className={styles.input}
                value={selectedId}
                onChange={(e) => onSelectContato(e.target.value)}
              >
                <option value="">— escolher da lista —</option>
                {contatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {prettyFromStored(c.celular)}
                  </option>
                ))}
              </select>
              <small className={styles.hint}>
                Para envio <strong>direto</strong> a um contato específico.
              </small>
            </div>

            <div className={styles.col}>
              <label className={styles.label}>Ou digitar manual (Brasil)</label>
              <input
                className={styles.input}
                placeholder="(11) 9XXXX-XXXX"
                value={maskedManual}
                onChange={(e) => onManualPhoneChange(e.target.value)}
                inputMode="numeric"
              />
              <small className={styles.hint}>
                Para envio <strong>direto</strong> sem usar a lista de contatos.
              </small>
            </div>

            <div className={`${styles.col} ${styles.full}`}>
              <label className={styles.label}>Mensagem</label>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva a mensagem que aparecerá pré-preenchida…"
              />
              <small className={styles.hint}>
                Esta mensagem será usada tanto para{" "}
                <strong>envio direto</strong> quanto para{" "}
                <strong>broadcast</strong>.
              </small>
            </div>
          </div>

          {/* Seletor do tipo — apenas para o QR Preview */}
          <div className={styles.typeSelector}>
            <label className={styles.label}>
              Tipo de QR Code (pré-visualização)
            </label>
            <div className={styles.typeButtons}>
              <button
                className={`${styles.typeBtn} ${
                  qrType === "direct" ? styles.active : ""
                }`}
                onClick={() => setQrType("direct")}
              >
                <MessageCircle size={20} />
                <div>
                  <strong>Envio Direto</strong>
                  <span>Para 1 contato específico</span>
                </div>
              </button>
              <button
                className={`${styles.typeBtn} ${
                  qrType === "broadcast" ? styles.active : ""
                }`}
                onClick={() => setQrType("broadcast")}
              >
                <Users size={20} />
                <div>
                  <strong>Broadcast</strong>
                  <span>Usuário escolhe múltiplos contatos</span>
                </div>
              </button>
            </div>
          </div>

          {/* Preview: QR + Link + Ações */}
          <div className={styles.preview}>
            <div className={styles.qrBox}>
              <canvas ref={canvasRef} />
              <div className={styles.qrLabel}>
                {qrType === "direct" ? "Envio Direto" : "Broadcast"}
              </div>
            </div>

            <div className={styles.linkBox}>
              <label className={styles.label}>
                Link gerado (pré-visualização)
              </label>
              <input
                className={styles.input}
                value={activeLink || "— configure a mensagem —"}
                readOnly
              />
              <div className={styles.actions}>
                {/* Sempre habilitado — decisão/validação acontece na modal */}
                {canOpenWhatsApp && (
                  <button
                    className={styles.primaryBtn}
                    onClick={openWhatsApp}
                    title="Abrir no WhatsApp"
                  >
                    <FaWhatsapp size={18} />
                    Abrir WhatsApp
                  </button>
                )}

                {canCopyLink && (
                  <button
                    className={styles.ghostBtn}
                    onClick={copyLink}
                    disabled={!activeLink}
                    title="Copiar link"
                  >
                    <Copy size={16} />
                    Copiar
                  </button>
                )}

                {copied && <span className={styles.toast}>Link copiado!</span>}
              </div>
              <small className={styles.hint}>
                O QR acima muda conforme o tipo selecionado para
                pré-visualização.
              </small>
            </div>
          </div>
        </section>

        {/* ===== Modal 1 — Escolher tipo de envio ===== */}
        {showChoiceModal && (
          <>
            <div
              className={styles.modalOverlay}
              onClick={() => setShowChoiceModal(false)}
            />
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-label="Escolher tipo de envio"
            >
              <div className={styles.modalHeader}>
                <h3>Como deseja enviar?</h3>
                <button
                  className={styles.modalClose}
                  onClick={() => setShowChoiceModal(false)}
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalContent}>
                <button
                  className={styles.modalOption}
                  onClick={() => handleChoice("direct")}
                  title="Enviar direto para o contato selecionado ou número manual"
                >
                  <MessageCircle size={24} />
                  <div className={styles.modalOptionContent}>
                    <strong>Envio Direto</strong>
                    <span>Vai para o chat do contato selecionado</span>
                  </div>
                </button>

                <button
                  className={styles.modalOption}
                  onClick={() => handleChoice("broadcast")}
                  title="Abrir WhatsApp para escolher múltiplos contatos"
                >
                  <Users size={24} />
                  <div className={styles.modalOptionContent}>
                    <strong>Broadcast</strong>
                    <span>Você escolhe múltiplos contatos no WhatsApp</span>
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ===== Modal 2 — Aviso (quando faltou contato/número ou mensagem) ===== */}
        {showHintModal && (
          <>
            <div className={styles.modalOverlay} onClick={closeHintAndFocus} />
            <div
              className={styles.modal}
              role="dialog"
              aria-modal="true"
              aria-label="Ação necessária"
            >
              <div className={styles.modalHeader}>
                <h3>Ação necessária</h3>
                <button
                  className={styles.modalClose}
                  onClick={closeHintAndFocus}
                  aria-label="Fechar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalContent}>
                <p style={{ margin: 0 }}>{showHintModal.text}</p>
              </div>

              <div className={styles.modalFooter}>
                <button
                  className={styles.primaryBtn}
                  onClick={closeHintAndFocus}
                >
                  OK
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
