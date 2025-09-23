// pages/settings/index.tsx
import { useEffect, useRef, useState, useMemo } from "react";
import useSWR from "swr";
import Layout from "@/components/layout";
import styles from "./styles.module.scss";

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

  // preview local do arquivo selecionado
  const [logoPreview, setLogoPreview] = useState<string>(s.logoUrl || "");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(s);
    setLogoPreview(s.logoUrl || "");
  }, [s.companyName, s.timezone, s.logoUrl]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return; // trava pelo front também
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      await mutate();
      alert("Configurações salvas!");
    } catch (err: any) {
      alert(err?.message || "Erro ao salvar");
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

    // Preview imediato (local)
    const url = URL.createObjectURL(file);
    setLogoPreview(url);

    // Preenche automaticamente o caminho público para você mover o arquivo depois
    setForm((f) => ({ ...f, logoUrl: `/imagens/${file.name}` }));
  }

  const readOnly = !canSave || isLoading;

  return (
    <Layout requireAuth={true}>
      <div className={styles.topbar}>
        <h1 className={styles.pageTitle}>Configurações</h1>
        <span className={styles.hint}>
          Ajuste identidade visual e preferências da conta.
        </span>
      </div>

      <form className={`card ${styles.form}`} onSubmit={onSubmit}>
        {isLoading ? (
          <div className={styles.loading}>Carregando…</div>
        ) : (
          <>
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
              </div>

              <div className={styles.col}>
                <label className={styles.label}>Timezone</label>
                <select
                  className={styles.select}
                  value={form.timezone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, timezone: e.target.value }))
                  }
                  disabled={readOnly}
                >
                  <option value="America/Sao_Paulo">America/Sao_Paulo</option>
                  <option value="America/Manaus">America/Manaus</option>
                  <option value="America/Fortaleza">America/Fortaleza</option>
                  <option value="America/Recife">America/Recife</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div className={styles.col}>
                <label className={styles.label}>Logo (caminho público)</label>
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
                    className={styles.ghostBtn}
                    onClick={openFilePicker}
                    title={
                      canSave
                        ? "Selecionar arquivo para pré-visualização"
                        : "Sem permissão para alterar"
                    }
                    disabled={readOnly}
                  >
                    Escolher arquivo…
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={onPickLogo}
                    style={{ display: "none" }}
                  />
                </div>
              </div>
            </div>

            <div className={styles.previewWrap}>
              <span className={styles.label}>Pré-visualização</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoPreview || form.logoUrl || "/imagens/escudo.png"}
                alt="Logo preview"
                className={styles.logoPreview}
                onClick={openFilePicker}
                style={{ cursor: canSave ? "pointer" : "default" }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "/imagens/escudo.png";
                }}
              />
            </div>

            <div className={styles.actions}>
              <button
                className={styles.primaryBtn}
                disabled={saving || !canSave}
                title={canSave ? "Salvar" : "Sem permissão para salvar"}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </>
        )}
      </form>
    </Layout>
  );
}
