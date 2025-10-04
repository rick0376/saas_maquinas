// pages/settings/index.tsx
import { useEffect, useRef, useState, useMemo } from "react";
import useSWR from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";
import {
  Settings,
  Building,
  Clock,
  Image,
  Upload,
  Save,
  Eye,
  AlertCircle,
  Check,
} from "lucide-react";

// 🔐 Permissões
import {
  hasPermission,
  type Role,
  type PermissionAction,
} from "../../utils/permissions";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AppSettings = {
  companyName: string;
  timezone: string;
  logoUrl: string; // caminho público (ex.: /imagens/logo2.png)
};

const DEFAULTS: AppSettings = {
  companyName: process.env.NEXT_PUBLIC_CLIENTE_NOME || "Sua Fábrica",
  timezone: "America/Sao_Paulo",
  logoUrl: "/imagens/logo2.png",
};

const TIMEZONE_OPTIONS = [
  { value: "America/Sao_Paulo", label: "São Paulo (UTC-3)" },
  { value: "America/Manaus", label: "Manaus (UTC-4)" },
  { value: "America/Fortaleza", label: "Fortaleza (UTC-3)" },
  { value: "America/Recife", label: "Recife (UTC-3)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC-5)" },
  { value: "UTC", label: "UTC (Universal)" },
];

export default function SettingsPage() {
  // ===== Sessão e permissões =====
  const { data: sess } = useSWR<any>("/api/auth/session", fetcher, {
    revalidateOnFocus: false,
  });
  const myRole: Role = (sess?.user?.role as Role) || "USER";
  const can = (a: PermissionAction) =>
    hasPermission(myRole, sess?.user?.permissoes, "settings", a);

  const canView = useMemo(() => can("view"), [sess, myRole]);
  const canSave = useMemo(() => can("save"), [sess, myRole]);

  // Se não pode visualizar, bloqueia a página
  if (sess && !canView) {
    return (
      <Layout requireAuth={true}>
        <div className="card" style={{ padding: 16, marginTop: 16 }}>
          <strong>Sem acesso às Configurações.</strong>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Solicite ao administrador a permissão de visualização.
          </div>
        </div>
      </Layout>
    );
  }

  // ===== Dados =====
  const { data, isLoading, mutate } = useSWR<{ data: AppSettings }>(
    "/api/settings",
    fetcher,
    { revalidateOnFocus: false }
  );

  const s: AppSettings = data?.data || DEFAULTS;

  const [form, setForm] = useState<AppSettings>(s);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>("");

  // preview local do arquivo selecionado
  const [logoPreview, setLogoPreview] = useState<string>(s.logoUrl || "");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(s);
    setLogoPreview(s.logoUrl || "");
  }, [s.companyName, s.timezone, s.logoUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Falha ao salvar");
      }

      await mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  }

  function openFilePicker() {
    if (!canSave) return;
    fileRef.current?.click();
  }

  function onPickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação de tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Arquivo muito grande. Máximo 5MB.");
      return;
    }

    // Validação de tipo
    if (!file.type.startsWith("image/")) {
      setError("Apenas arquivos de imagem são aceitos.");
      return;
    }

    // Preview imediato (local)
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
    setError("");

    // Preenche automaticamente o caminho público
    setForm((f) => ({ ...f, logoUrl: `/imagens/${file.name}` }));
  }

  const readOnly = !canSave || isLoading;
  const hasChanges = JSON.stringify(form) !== JSON.stringify(s);

  return (
    <Layout requireAuth={true}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <div className={styles.titleWrap}>
            <h1 className={styles.pageTitle}>
              <Settings size={24} />
              Configurações do Sistema
            </h1>
            <span className={styles.hint}>
              Ajuste identidade visual e preferências gerais da aplicação.
            </span>
          </div>
          {hasChanges && canSave && (
            <div className={styles.changesBadge}>
              <AlertCircle size={16} />
              Alterações não salvas
            </div>
          )}
        </header>

        <form className={`card ${styles.form}`} onSubmit={onSubmit}>
          {isLoading ? (
            <div className={styles.loading}>
              <div className={styles.spinner} />
              <span>Carregando configurações…</span>
            </div>
          ) : (
            <>
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  <Building size={20} />
                  Informações da Empresa
                </h3>

                <div className={styles.row}>
                  <div className={styles.col}>
                    <label className={styles.label}>Nome da empresa</label>
                    <input
                      className={styles.input}
                      value={form.companyName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, companyName: e.target.value }))
                      }
                      placeholder="Ex.: Fábrica XPTO"
                      required
                      disabled={readOnly}
                    />
                    <small className={styles.fieldHint}>
                      Nome que aparece nos relatórios e cabeçalhos
                    </small>
                  </div>

                  <div className={styles.col}>
                    <label className={styles.label}>
                      <Clock size={16} />
                      Fuso horário
                    </label>
                    <select
                      className={styles.select}
                      value={form.timezone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, timezone: e.target.value }))
                      }
                      disabled={readOnly}
                    >
                      {TIMEZONE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <small className={styles.fieldHint}>
                      Fuso usado para exibir datas e horários
                    </small>
                  </div>
                </div>
              </div>

              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>
                  <Image size={20} />
                  Identidade Visual
                </h3>

                <div className={styles.logoSection}>
                  <div className={styles.col}>
                    <label className={styles.label}>Caminho do logo</label>
                    <div className={styles.logoRow}>
                      <input
                        className={styles.input}
                        value={form.logoUrl}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, logoUrl: e.target.value }))
                        }
                        placeholder="/imagens/logo2.png"
                        disabled={readOnly}
                      />
                      <button
                        type="button"
                        className={styles.uploadBtn}
                        onClick={openFilePicker}
                        title={
                          canSave
                            ? "Selecionar arquivo para pré-visualização"
                            : "Sem permissão para alterar"
                        }
                        disabled={readOnly}
                      >
                        <Upload size={16} />
                        Carregar
                      </button>
                    </div>
                    <small className={styles.fieldHint}>
                      Caminho público do arquivo de logo (máx. 5MB)
                    </small>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={onPickLogo}
                      style={{ display: "none" }}
                    />
                  </div>

                  <div className={styles.previewWrap}>
                    <label className={styles.label}>
                      <Eye size={16} />
                      Pré-visualização
                    </label>
                    <div className={styles.previewContainer}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          logoPreview || form.logoUrl || "/imagens/escudo.png"
                        }
                        alt="Logo preview"
                        className={styles.logoPreview}
                        onClick={openFilePicker}
                        style={{ cursor: canSave ? "pointer" : "default" }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/imagens/escudo.png";
                        }}
                      />
                      {canSave && (
                        <div className={styles.previewHint}>
                          Clique para alterar
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback Messages */}
              {error && (
                <div className={styles.errorMessage}>
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {saved && (
                <div className={styles.successMessage}>
                  <Check size={16} />
                  Configurações salvas com sucesso!
                </div>
              )}

              <div className={styles.actions}>
                <button
                  className={styles.primaryBtn}
                  disabled={saving || !canSave || !hasChanges}
                  title={
                    !canSave
                      ? "Sem permissão para salvar"
                      : !hasChanges
                      ? "Nenhuma alteração para salvar"
                      : "Salvar configurações"
                  }
                >
                  {saving ? (
                    <>
                      <div className={styles.buttonSpinner} />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      Salvar alterações
                    </>
                  )}
                </button>

                {hasChanges && (
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => {
                      setForm(s);
                      setLogoPreview(s.logoUrl || "");
                      setError("");
                    }}
                    disabled={saving}
                  >
                    Descartar alterações
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </div>
    </Layout>
  );
}
