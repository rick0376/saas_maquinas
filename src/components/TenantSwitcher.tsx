import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function setCookie(name: string, value: string, maxAgeSec = 60 * 60 * 24) {
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}
function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const raw = document.cookie || "";
  const found = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=")[1]) : null;
}

export default function TenantSwitcher() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;
  const isSuper = role === "SUPERADMIN";

  // Hook sempre chamado (passar null só desabilita o SWR, mas mantém a ordem dos hooks)
  const { data } = useSWR<{
    ok: boolean;
    data: { id: string; name: string }[];
  }>(isSuper ? "/api/admin/tenants" : null, fetcher, {
    revalidateOnFocus: false,
  });

  const [current, setCurrent] = useState<string | "ALL">("ALL");

  // Hook sempre chamado; a lógica interna pode depender do isSuper
  useEffect(() => {
    const cookie = readCookie("selectedTenantId");
    setCurrent(cookie || "ALL");
  }, []);

  // Hook sempre chamado; a memoização pode depender do isSuper
  const options = useMemo(() => {
    const base = [{ id: "ALL", name: "Todos (agregado)" }];
    const list = isSuper ? data?.data ?? [] : [];
    return base.concat(list);
  }, [data, isSuper]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setCurrent(id);
    setCookie("adminMode", "1");
    if (id === "ALL") clearCookie("selectedTenantId");
    else setCookie("selectedTenantId", id);
    window.location.reload();
  }

  // Só aqui decidimos renderizar ou não
  if (!isSuper) return null;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>Cliente:</span>
      <select
        value={current}
        onChange={onChange}
        style={{ padding: "6px 8px" }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
