// pages/integracoes/whatsapp/index.tsx
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Copy } from "lucide-react";

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

// ===================== Helpers de telefone (BR) =====================
function onlyDigits(v: string) {
  return v.replace(/\D+/g, "");
}
/** Normaliza entrada "local" (DDD+numero) para E.164 Brasil: +55DDDNÚMERO */
function toE164FromLocal(localDigits: string) {
  const d = onlyDigits(localDigits);
  if (!d) return "";
  const with55 = d.startsWith("55") ? d : `55${d}`;
  return `+${with55}`;
}
/** Converte do armazenado (+55...) para apenas DDD+numero (para input local) */
function toLocalFromStored(stored: string) {
  const d = onlyDigits(stored);
  return d.startsWith("55") ? d.slice(2) : d;
}
/** Formata bonito um número armazenado (+55...) */
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
/** Máscara enquanto digita local (sem +55), ex: (11) 98765-4321 */
function maskLocalTyping(localDigits: string) {
  const d = onlyDigits(localDigits).slice(0, 11);
  const ddd = d.slice(0, 2);
  const num = d.slice(2);
  if (d.length <= 2) return ddd;
  if (num.length > 5) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5, 9)}`;
  if (num.length > 0) return `(${ddd}) ${num}`;
  return `(${ddd}`;
}

// ===================== Página =====================
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

  // 🔒 Bloqueia página se não puder visualizar
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

  // Contatos do tenant atual (a API já filtra por tenantId)
  const { data } = useSWR<{ data: Contato[] }>("/api/contatos", fetcher, {
    revalidateOnFocus: false,
  });
  const contatos: Contato[] = data?.data ?? [];

  // Nome do cliente/fábrica atual
  const { data: tRes } = useSWR<TenantRes>("/api/tenant/current", fetcher);
  const tenantName =
    (tRes && "ok" in tRes && tRes.ok && tRes.data?.name) || "Sua Empresa";

  // Estado: seleção de contato OU telefone digitado
  const [selectedId, setSelectedId] = useState<string>(""); // contato
  const [localPhone, setLocalPhone] = useState<string>(""); // DDD+numero (sem +55)
  const [message, setMessage] = useState<string>(
    "Olá! Teste do SaaS Máquinas ✅"
  );
  const [copied, setCopied] = useState(false);

  // Canvas p/ QRCode
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Número final (E.164) prioriza o contato; se vazio, usa digitado
  const phoneE164 = useMemo(() => {
    const contato = contatos.find((c) => c.id === selectedId);
    if (contato?.celular) {
      const digits = onlyDigits(contato.celular);
      return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
    }
    const manual = toE164FromLocal(localPhone);
    return manual || "";
  }, [contatos, selectedId, localPhone]);

  // Link wa.me
  const waLink = useMemo(() => {
    if (!phoneE164) return "";
    const phone = onlyDigits(phoneE164); // wa.me usa apenas dígitos
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }, [phoneE164, message]);

  // Gera QR quando mudar link
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!waLink || !canvasRef.current) return;
      const QR = (await import("qrcode")).default as any;
      if (cancelled) return;
      QR.toCanvas(canvasRef.current, waLink, { width: 260 });
    })();
    return () => {
      cancelled = true;
    };
  }, [waLink]);

  // Handlers
  function onSelectContato(id: string) {
    setSelectedId(id);
    if (id) setLocalPhone(""); // limpa manual quando seleciona contato
  }
  function onManualPhoneChange(v: string) {
    setSelectedId(""); // limpa contato quando digita manual
    const digits = onlyDigits(v).slice(0, 11);
    setLocalPhone(digits);
  }
  function maskedManual() {
    return maskLocalTyping(localPhone);
  }
  async function copyLink() {
    // 🔐 trava extra
    if (!canCopyLink || !waLink) return;
    await navigator.clipboard.writeText(waLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
              Gere um QR para abrir a conversa no WhatsApp com mensagem
              pré-preenchida.
            </p>
          </div>
        </header>

        <section className={`card ${styles.card}`}>
          <header className={styles.cardHead}>
            <h3>Destino</h3>
          </header>

          <div className={styles.formGrid}>
            <div className={styles.col}>
              <label className={styles.label}>Selecionar contato</label>
              <select
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
                Contatos vêm de <code>/api/contatos</code> e já são filtrados
                pelo cliente/fábrica corrente.
              </small>
            </div>

            <div className={styles.col}>
              <label className={styles.label}>Ou digitar manual (Brasil)</label>
              <input
                className={styles.input}
                placeholder="(11) 9XXXX-XXXX"
                value={maskedManual()}
                onChange={(e) => onManualPhoneChange(e.target.value)}
                inputMode="numeric"
              />
              <small className={styles.hint}>
                O link final usa o formato <strong>+55DDDNÚMERO</strong>.
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
                Emojis e quebras de linha são suportados.
              </small>
            </div>
          </div>

          <div className={styles.preview}>
            <div className={styles.qrBox}>
              <canvas ref={canvasRef} />
            </div>

            <div className={styles.linkBox}>
              <label className={styles.label}>Link gerado</label>
              <input
                className={styles.input}
                value={waLink || "— informe um telefone e a mensagem —"}
                readOnly
              />
              <div className={styles.actions}>
                {/* 🔐 Abrir no WhatsApp: visível só se permitido */}
                {canOpenWhatsApp && (
                  <a
                    className={styles.primaryBtn}
                    href={waLink || "#"}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!waLink}
                    onClick={(e) => {
                      if (!waLink) e.preventDefault();
                    }}
                    title="Abrir no WhatsApp"
                  >
                    Abrir no WhatsApp
                  </a>
                )}

                {/* 🔐 Copiar: visível só se permitido */}
                {canCopyLink && (
                  <button
                    className={styles.ghostBtn}
                    onClick={copyLink}
                    disabled={!waLink}
                    title="Copiar link"
                  >
                    <Copy size={16} />
                    Copiar
                  </button>
                )}

                {copied && <span className={styles.toast}>Link copiado!</span>}
              </div>
              <small className={styles.hint}>
                Dica: teste o QR com a câmera do celular. Ele abrirá o WhatsApp
                (app ou web).
              </small>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
