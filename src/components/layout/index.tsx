// src/components/layout/index.tsx
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import { mutate as swrMutate } from "swr";
import {
  Menu,
  X,
  User,
  LogOut,
  Settings,
  Home,
  Factory as Building2,
  BarChart3,
  Wrench,
  Shield,
  Users,
  ClipboardList,
  MessageCircle,
  LayoutGrid,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import styles from "./styles.module.scss";
import nav from "./nav.module.scss";

type Props = {
  requireAuth: boolean;
  children: React.ReactNode;
  showNav?: boolean;
};

type Role = "USER" | "ADMIN" | "SUPERADMIN";
type Tenant = { id: string; name: string };

function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const raw = document.cookie || "";
  const found = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=")[1]) : null;
}
function setCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const exp = new Date();
  exp.setTime(exp.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `; expires=${exp.toUTCString()}`;
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}${expires}; path=/; SameSite=Lax`;
}
function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

export default function Layout({ children, requireAuth = true }: Props) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAuthed = status === "authenticated";
  const role: Role = ((session as any)?.user?.role as Role) || "USER";

  useEffect(() => {
    if (status !== "authenticated") return;
    const userRole = (session?.user as any)?.role as Role;

    // Usuário que não é SUPERADMIN não deve carregar cookies de adminMode/tenant
    if (userRole !== "SUPERADMIN") {
      deleteCookie("adminMode");
      deleteCookie("selectedTenantId");
    }
  }, [status, session]);

  // estado do menu suspenso
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const burgerRef = useRef<HTMLButtonElement | null>(null);

  // modal de confirmação de logout
  const [logoutOpen, setLogoutOpen] = useState(false);
  const openLogout = () => {
    setOpen(false);
    setLogoutOpen(true);
  };
  const closeLogout = () => setLogoutOpen(false);
  //const confirmLogout = () => signOut({ callbackUrl: "/" });

  const confirmLogout = () => {
    // Limpa qualquer fixação de tenant
    deleteCookie("adminMode");
    deleteCookie("selectedTenantId");

    // Sai da sessão
    signOut({ callbackUrl: "/" });
  };

  // fecha ao trocar de rota
  useEffect(() => {
    const close = () => setOpen(false);
    router.events.on("routeChangeStart", close);
    return () => router.events.off("routeChangeStart", close);
  }, [router.events]);

  // fecha com ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setLogoutOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // clique-fora fecha menu
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (burgerRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isActive = (href: string) =>
    router.pathname === href || router.pathname.startsWith(href + "/");

  const can = {
    manageUsers: role === "ADMIN" || role === "SUPERADMIN",
    superOnly: role === "SUPERADMIN",
  };

  const groupedNav = useMemo(() => {
    return [
      {
        group: "Início",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: <Home size={16} /> },
        ],
      },
      {
        group: "Operação",
        items: [
          {
            href: "/painel/maquinas",
            label: "Status",
            icon: <LayoutGrid size={16} />,
          },
          {
            href: "/operacao",
            label: "Operação",
            icon: <ClipboardList size={16} />,
          },
          { href: "/paradas", label: "Paradas", icon: <BarChart3 size={16} /> },
        ],
      },
      {
        group: "Cadastros",
        items: [
          { href: "/maquinas", label: "Máquinas", icon: <Wrench size={16} /> },
          { href: "/secoes", label: "Seções", icon: <Building2 size={16} /> },
          { href: "/contatos", label: "Contatos", icon: <Users size={16} /> },
          ...(can.manageUsers
            ? [
                {
                  href: "/usuarios",
                  label: "Usuários",
                  icon: <User size={16} />,
                },
              ]
            : []),
        ],
      },
      {
        group: "Relatórios",
        items: [
          {
            href: "/relatorios/paradas",
            label: "Paradas",
            icon: <FileText size={16} />,
          },
        ],
      },
      {
        group: "Integrações",
        items: [
          {
            href: "/integracoes/whatsapp",
            label: "WhatsApp",
            icon: <MessageCircle size={16} />,
          },
        ],
      },
      {
        group: "Administração",
        items: can.superOnly
          ? [
              {
                href: "/clientes",
                label: "Clientes",
                icon: <Shield size={16} />,
              },
            ]
          : [],
      },
      {
        group: "Conta",
        items: [
          {
            href: "/settings",
            label: "Configurações",
            icon: <Settings size={16} />,
          },
          {
            href: "/admin/permissoes",
            label: "Permissões",
            icon: <SlidersHorizontal size={16} />,
            hidden: !can.manageUsers,
          },
        ],
      },
    ].filter((g) => g.items.length > 0);
  }, [can.manageUsers, can.superOnly]);

  const brandTitle = process.env.NEXT_PUBLIC_CLIENTE_NOME || "SaaS Máquinas";
  const brandSub =
    process.env.NEXT_PUBLIC_CLIENTE_DESC || "Gestão de Máquinas e Interrupções";

  // ================== SELECT RÁPIDO DE CLIENTE (SUPERADMIN) ==================
  const isSuper = role === "SUPERADMIN";
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSelectValue, setTenantSelectValue] = useState<string>("ALL"); // "ALL" = agregado

  const sortedTenants = useMemo(
    () =>
      [...tenants].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "pt-BR", {
          sensitivity: "base",
        })
      ),
    [tenants]
  );

  // carrega lista de clientes para SUPERADMIN
  useEffect(() => {
    let active = true;
    (async () => {
      if (!isSuper) return;
      try {
        const r = await fetch("/api/admin/tenants");
        const j = r.ok ? await r.json() : null;
        if (!active) return;
        const list: Tenant[] = j?.data ?? [];
        setTenants(list);
      } catch {
        // ignora
      }
    })();

    // inicializa valor do select a partir dos cookies
    const adminMode = getCookie("adminMode") === "1";
    const sel = getCookie("selectedTenantId");
    setTenantSelectValue(adminMode && sel ? sel : "ALL");

    return () => {
      active = false;
    };
  }, [isSuper]);

  function applyTenantSelection(next: string) {
    if (next === "ALL") {
      setCookie("adminMode", "0");
      deleteCookie("selectedTenantId");
    } else {
      setCookie("adminMode", "1");
      setCookie("selectedTenantId", next);
    }

    // Revalida todas as chaves SWR ativas
    swrMutate(() => true, undefined, { revalidate: true });

    // Atualiza a rota atual (sem pular para o topo)
    router.replace(router.asPath, undefined, { scroll: false });

    // Se preferir um “hard reload” (mais agressivo), use:
    // window.location.reload();
  }
  const Header = (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        {/* Brand */}
        <Link
          href={requireAuth ? (isAuthed ? "/dashboard" : "/") : "/"}
          className={styles.logoArea}
        >
          <div className={styles.logoContainer}>
            <Image
              src="/imagens/logo2.png"
              alt="Logo"
              width={40}
              height={40}
              className={styles.logo}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src =
                  "/imagens/escudo.png";
              }}
            />
          </div>
          <div className={styles.titleContainer}>
            <span className={styles.title}>{brandTitle}</span>
            <span className={styles.subtitle}>{brandSub}</span>
          </div>
        </Link>

        {/* Nav do header */}
        <nav className={nav.nav}>
          <div className={nav.rightArea}>
            {/* ATALHO SUPERADMIN (DESKTOP): link da tela de clientes */}
            {isAuthed && isSuper && (
              <>
                <Link
                  href="/admin/tenants"
                  className={`${nav.actionBtn} ${nav.hideOnMobile}`}
                  title="Selecionar cliente"
                >
                  <Building2 size={16} />
                </Link>

                {/* SELECT RÁPIDO — oculto em mobile */}
                <select
                  className={nav.hideOnMobile}
                  style={{
                    marginLeft: "0.5rem",
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    padding: "0 0.5rem",
                    background: "#fff",
                    color: "#0f172a",
                  }}
                  value={tenantSelectValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setTenantSelectValue(v);
                    applyTenantSelection(v);
                  }}
                  title="Trocar cliente rapidamente"
                >
                  <option value="ALL">Todos — Agregado</option>
                  {sortedTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {isAuthed ? (
              <div className={nav.userArea}>
                <div className={nav.userChip}>
                  <span className={nav.userAvatar}>
                    {(session?.user?.name || session?.user?.email || "?")
                      .toString()
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div className={nav.userInfo}>
                    <span className={nav.userName}>
                      {session?.user?.name || session?.user?.email}
                    </span>
                    <span className={nav.userRole}>
                      {(session as any)?.user?.role || "USER"}
                    </span>
                  </div>
                </div>

                <div className={nav.actions}>
                  <Link
                    href="/settings"
                    className={`${nav.actionBtn} ${nav.hideOnMobile}`}
                    title="Configurações"
                  >
                    <Settings size={16} />
                  </Link>

                  <button
                    className={`${nav.actionBtn} ${nav.logoutBtn} ${nav.hideOnMobile}`}
                    onClick={openLogout}
                    title="Sair"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className={nav.userArea}>
                <Link href="/login" className={nav.linkBtn}>
                  Entrar
                </Link>
              </div>
            )}

            {/* Burger */}
            <button
              ref={burgerRef}
              className={nav.burger}
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              aria-controls="main-menu"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>

          {/* Dropdown (mobile) */}
          <div
            id="main-menu"
            ref={menuRef}
            className={`${nav.dropdown} ${open ? nav.open : ""}`}
            role="menu"
            aria-hidden={!open}
          >
            {/* ATALHO SUPERADMIN (MOBILE) */}
            {isAuthed && isSuper && (
              <Link
                href="/admin/tenants"
                className={nav.item}
                onClick={() => setOpen(false)}
              >
                <span className={nav.itemIcon}>
                  <Building2 size={16} />
                </span>
                <span>Selecionar cliente</span>
              </Link>
            )}

            {requireAuth &&
              isAuthed &&
              groupedNav.map(({ group, items }) => (
                <div key={group} className={nav.group}>
                  <div className={nav.groupTitle}>{group}</div>
                  {items
                    .filter((it) => !("hidden" in it && it.hidden))
                    .map((it) => (
                      <Link
                        key={it.href}
                        href={it.href}
                        className={`${nav.item} ${
                          isActive(it.href) ? nav.active : ""
                        }`}
                        aria-current={isActive(it.href) ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        <span className={nav.itemIcon}>{it.icon}</span>
                        <span>{it.label}</span>
                      </Link>
                    ))}
                </div>
              ))}

            {isAuthed && <div className={nav.divider} />}

            {/* Config (mobile) */}
            {isAuthed && (
              <Link
                href="/settings"
                className={`${nav.item} ${nav.showOnMobile}`}
                onClick={() => setOpen(false)}
              >
                <span className={nav.itemIcon}>
                  <Settings size={16} />
                </span>
                <span>Configurações</span>
              </Link>
            )}

            {/* Sair (no menu) */}
            {isAuthed && (
              <button
                className={`${nav.item} ${nav.logoutItem}`}
                onClick={openLogout}
              >
                <span className={nav.itemIcon}>
                  <LogOut size={16} />
                </span>
                <span>Sair</span>
              </button>
            )}
          </div>

          {open && <div className={nav.overlay} />}
        </nav>
      </div>
    </header>
  );

  const Footer = (
    <footer className={styles.footer}>
      <div className={styles.footerContent}>
        <span>
          © {new Date().getFullYear()} — {brandTitle}
        </span>
        <span className={styles.dot} />
        <span className={styles.footerMuted}>Todos os direitos reservados</span>
      </div>
    </footer>
  );

  const shouldHideForAuthLoading = requireAuth && status === "loading";

  return (
    <>
      <div className={styles.wrapper}>
        {Header}
        <main className={styles.main}>
          {shouldHideForAuthLoading ? null : children}
        </main>
        {Footer}
      </div>

      {/* ===== MODAL FORA DO WRAPPER ===== */}
      {logoutOpen && (
        <div
          className={styles.modalOverlay}
          onClick={closeLogout}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-title"
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalIcon}>
              <LogOut size={22} />
            </div>
            <h3 id="logout-title" className={styles.modalTitle}>
              Sair da conta?
            </h3>
            <p className={styles.modalText}>
              Você tem certeza que deseja encerrar a sessão agora?
            </p>
            <div className={styles.modalActions}>
              <button className={styles.ghostBtn} onClick={closeLogout}>
                Cancelar
              </button>
              <button className={styles.dangerBtn} onClick={confirmLogout}>
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
