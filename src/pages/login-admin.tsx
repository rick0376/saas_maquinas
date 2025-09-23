import { useEffect } from "react";
import { useRouter } from "next/router";

export default function LoginAdmin() {
  const router = useRouter();
  useEffect(() => {
    // habilita modo admin e limpa seleção de tenant
    document.cookie = `adminMode=1; Path=/; SameSite=Lax`;
    document.cookie = `selectedTenantId=; Path=/; Max-Age=0; SameSite=Lax`;
    router.replace("/login");
  }, [router]);
  return null;
}
