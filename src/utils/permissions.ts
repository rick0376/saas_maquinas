// src/utils/permissions.ts

const MODULE = "painel_maquinas" as const;

export type Role = "USER" | "ADMIN" | "SUPERADMIN";

/** Módulos (1-para-1 com suas páginas/áreas) */
export type PermissionModule =
  | "dashboard"
  | "painel_maquinas"
  | "operacao"
  | "paradas"
  | "maquinas"
  | "secoes"
  | "contatos"
  | "usuarios"
  | "relatorios_paradas"
  | "integracoes_whatsapp"
  | "clientes"
  | "settings"
  | "permissoes";

/** Ações específicas por módulo (chaves exatamente como solicitado) */
export type PermissionAction =
  // dashboard
  | "view"
  | "exportPdf"
  // painel_maquinas
  | "edit_paradas"
  // operacao
  | "start_parada"
  | "finish_parada"
  // paradas
  | "create"
  | "edit"
  | "whatsapp_send"
  // cadastros comuns
  | "add"
  | "delete"
  // integrações whatsapp
  | "open_whatsapp"
  | "copy_link"
  // settings & permissoes
  | "save";

/** Esquema: quais ações existem em cada módulo */
export const PERMISSIONS_SCHEMA: Record<PermissionModule, PermissionAction[]> =
  {
    // Dashboard
    dashboard: ["view", "exportPdf"],

    // Painel de máquinas
    painel_maquinas: ["view", "edit_paradas"],

    // Operação
    operacao: ["view", "start_parada", "finish_parada"],

    // Paradas (lista/relatório operacional)
    paradas: ["view", "create", "edit", "whatsapp_send"],

    // Cadastros
    maquinas: ["view", "add", "edit", "delete"],
    secoes: ["view", "add", "edit", "delete"],
    contatos: ["view", "add", "edit", "delete"],
    usuarios: ["view", "add", "edit", "delete"],

    // Relatórios
    relatorios_paradas: ["view", "exportPdf"],

    // Integrações
    integracoes_whatsapp: ["view", "open_whatsapp", "copy_link"],

    // Administração
    clientes: ["view", "add", "edit", "delete"],

    // Configurações
    settings: ["view", "save"],

    // Permissões (tela de matriz)
    permissoes: ["view", "save"],
  };

export type PermissionMatrix = Partial<
  Record<PermissionModule, Partial<Record<PermissionAction, boolean>>>
>;

/** Garante que todo módulo/ação exista no objeto com false por padrão */
export function ensurePermissions(
  input: PermissionMatrix | null | undefined
): Record<PermissionModule, Record<PermissionAction, boolean>> {
  const out: any = {};
  for (const mod of Object.keys(PERMISSIONS_SCHEMA) as PermissionModule[]) {
    out[mod] = out[mod] || {};
    const actions = PERMISSIONS_SCHEMA[mod];
    for (const act of actions) {
      const current =
        input?.[mod]?.[act] === true || input?.[mod]?.[act] === false
          ? (input as any)[mod][act]
          : false;
      out[mod][act] = current;
    }
  }
  return out;
}

/** Regra final de autorização */
export function hasPermission(
  role: Role,
  matrix: PermissionMatrix | null | undefined,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  // SUPERADMIN sempre pode tudo
  if (role === "SUPERADMIN") return true;

  // Para ADMIN/USER: consulta matriz
  const safe = ensurePermissions(matrix);
  return !!safe[module]?.[action];
}

/** Dados para renderização da UI (rótulos) caso precise na página de Permissões */
export const MODULES = (
  Object.keys(PERMISSIONS_SCHEMA) as PermissionModule[]
).map((key) => ({
  key,
  label: {
    dashboard: "Dashboard",
    painel_maquinas: "Painel de Máquinas",
    operacao: "Operação",
    paradas: "Paradas",
    maquinas: "Máquinas",
    secoes: "Seções",
    contatos: "Contatos",
    usuarios: "Usuários",
    relatorios_paradas: "Relatórios — Paradas",
    integracoes_whatsapp: "Integrações — WhatsApp",
    clientes: "Admin — Clientes",
    settings: "Configurações",
    permissoes: "Permissões",
  }[key],
}));

/** Cabeçalhos das ações para a UI (tabela da matriz) */
export const ACTIONS = [
  // deixe a ordem legível na tela
  { key: "view", label: "Visualizar" },
  { key: "exportPdf", label: "Exportar PDF" },

  { key: "edit_paradas", label: "Editar Paradas" },

  { key: "start_parada", label: "Iniciar Parada" },
  { key: "finish_parada", label: "Finalizar Parada" },

  { key: "create", label: "Cadastrar" },
  { key: "edit", label: "Editar" },
  { key: "whatsapp_send", label: "Enviar WhatsApp" },

  { key: "add", label: "Adicionar" },
  { key: "delete", label: "Excluir" },

  { key: "open_whatsapp", label: "Abrir no WhatsApp" },
  { key: "copy_link", label: "Copiar Link" },

  { key: "save", label: "Salvar" },
] as const satisfies { key: PermissionAction; label: string }[];
