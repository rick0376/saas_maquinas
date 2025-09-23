import Link from "next/link";
import { useAcl } from "../hooks/useAcl";

export default function Nav() {
  const { can } = useAcl();

  return (
    <nav>
      <Link href="/admin/dashboard">Dashboard</Link>
      {can("maquinas", "view") && <Link href="/maquinas">Máquinas</Link>}
      {can("clientes", "view") && <Link href="/admin/clients">Clientes</Link>}
      {can("contatos", "view") && <Link href="/contatos">Contatos</Link>}
    </nav>
  );
}
