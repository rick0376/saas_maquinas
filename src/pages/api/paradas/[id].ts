// src/pages/api/paradas/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

/* ===== Helpers de tenant ===== */
function readCookie(req: NextApiRequest, name: string): string | null {
  const raw = req.headers.cookie || "";
  const match = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function resolveTenant(req: NextApiRequest, session: any) {
  const role = (session?.user as any)?.role as
    | "USER"
    | "ADMIN"
    | "SUPERADMIN"
    | undefined;
  const isSuper = role === "SUPERADMIN";
  const sessionTenantId = (session?.user as any)?.tenantId as
    | string
    | undefined;

  const cookieTenant = readCookie(req, "selectedTenantId") || undefined;
  const queryTenant =
    typeof req.query.tenantId === "string" ? req.query.tenantId : undefined;

  if (isSuper) {
    // prioridade: cookie -> query -> sessão -> null (agregado)
    return (cookieTenant || queryTenant || sessionTenantId || null) as
      | string
      | null;
  }
  return (sessionTenantId ?? null) as string | null;
}

/* ===== Tipos e listas (casam com o schema) ===== */
type ParadaTipo = "OPERACIONAL" | "NAO_OPERACIONAL";
type ParadaCategoria =
  | "MANUTENCAO_CORRETIVA"
  | "MANUTENCAO_PREVENTIVA"
  | "SETUP_TROCA_FERRAMENTA"
  | "FALTA_MATERIAL"
  | "QUALIDADE_INSPECAO"
  | "AJUSTE_PROCESSO"
  | "ABASTECIMENTO"
  | "LIMPEZA"
  | "ALMOCO"
  | "BANHEIRO"
  | "REUNIAO"
  | "TREINAMENTO"
  | "DDS"
  | "OUTROS_NAO_OPERACIONAL";

const CATS_OP: ParadaCategoria[] = [
  "MANUTENCAO_CORRETIVA",
  "MANUTENCAO_PREVENTIVA",
  "SETUP_TROCA_FERRAMENTA",
  "FALTA_MATERIAL",
  "QUALIDADE_INSPECAO",
  "AJUSTE_PROCESSO",
  "ABASTECIMENTO",
  "LIMPEZA",
];
const CATS_NOP: ParadaCategoria[] = [
  "ALMOCO",
  "BANHEIRO",
  "REUNIAO",
  "TREINAMENTO",
  "DDS",
  "OUTROS_NAO_OPERACIONAL",
];

function isCategoria(v: any): v is ParadaCategoria {
  return [...CATS_OP, ...CATS_NOP].includes(v);
}
function isTipo(v: any): v is ParadaTipo {
  return v === "OPERACIONAL" || v === "NAO_OPERACIONAL";
}

/**
 * Prioriza a CATEGORIA (se válida) e deduz o TIPO a partir dela.
 * Sem categoria válida, usa o TIPO (se válido) e escolhe uma categoria padrão do grupo.
 */
function coerceTipoCategoria(
  rawTipo?: any,
  rawCat?: any,
  fallbackTipo?: ParadaTipo,
  fallbackCat?: ParadaCategoria
): { tipo: ParadaTipo; categoria: ParadaCategoria } {
  // 1) Categoria válida => usa e deduz tipo
  if (isCategoria(rawCat)) {
    const categoria = rawCat as ParadaCategoria;
    const tipo: ParadaTipo = CATS_OP.includes(categoria)
      ? "OPERACIONAL"
      : "NAO_OPERACIONAL";
    return { tipo, categoria };
  }

  // 2) Sem categoria válida: tenta usar tipo; se não vier, cai no fallback
  const tipo: ParadaTipo = isTipo(rawTipo)
    ? rawTipo
    : fallbackTipo ?? "OPERACIONAL";
  const pool = tipo === "OPERACIONAL" ? CATS_OP : CATS_NOP;
  const categoria =
    fallbackCat && isCategoria(fallbackCat) ? fallbackCat : pool[0];
  return { tipo, categoria };
}

/** Dado uma categoria, devolve o status de máquina correspondente */
function statusFromCategoria(cat: ParadaCategoria) {
  const isMaint =
    cat === "MANUTENCAO_CORRETIVA" || cat === "MANUTENCAO_PREVENTIVA";
  return (isMaint ? "MANUTENCAO" : "PARADA") as "MANUTENCAO" | "PARADA";
}

/** Recalcula e atualiza o status da máquina após mudança em paradas */
async function recomputeMachineStatus(
  maquinaId: string,
  tenantId: string
): Promise<void> {
  // Existe outra parada ABERTA?
  const aberta = await prisma.parada.findFirst({
    where: { maquinaId, tenantId, horaFinalizacao: null },
    orderBy: { horaInicio: "desc" },
    select: { categoria: true },
  });

  if (!aberta) {
    // sem paradas abertas → máquina ativa
    await prisma.maquina.update({
      where: { id: maquinaId },
      data: { status: "ATIVA" as any },
    });
    return;
  }

  // com parada aberta → status conforme categoria da aberta
  const cat = (aberta.categoria || "OUTROS_NAO_OPERACIONAL") as ParadaCategoria;
  await prisma.maquina.update({
    where: { id: maquinaId },
    data: { status: statusFromCategoria(cat) as any },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query as { id: string };

  if (!id) {
    return res.status(400).json({ ok: false, error: "id inválido" });
  }

  try {
    // Sessão + tenant efetivo
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user)
      return res.status(401).json({ ok: false, error: "Não autenticado" });

    const role = (session.user as any)?.role as "USER" | "ADMIN" | "SUPERADMIN";
    const effectiveTenantId = resolveTenant(req, session); // string | null
    const sessionTenantId = (session.user as any)?.tenantId as
      | string
      | undefined;

    // Carrega a parada (com tipo/categoria) + máquina (tenant) para validar acesso
    const paradaFull = await prisma.parada.findUnique({
      where: { id },
      select: {
        id: true,
        horaInicio: true,
        horaFinalizacao: true,
        motivo: true,
        equipeAtuando: true,
        observacao: true,
        tempoIntervencao: true,
        tipo: true,
        categoria: true,
        maquinaId: true,
        maquina: {
          select: { id: true, tenantId: true, nome: true, codigo: true },
        },
      },
    });

    if (!paradaFull)
      return res
        .status(404)
        .json({ ok: false, error: "Parada não encontrada" });

    const paradaTenantId = paradaFull.maquina.tenantId;

    // Regras de acesso por tenant
    if (role !== "SUPERADMIN") {
      if (!sessionTenantId || paradaTenantId !== sessionTenantId) {
        return res.status(403).json({ ok: false, error: "Acesso negado" });
      }
    } else {
      if (effectiveTenantId && paradaTenantId !== effectiveTenantId) {
        return res.status(403).json({
          ok: false,
          error: "Acesso negado (tenant selecionado não confere)",
        });
      }
    }

    if (req.method === "GET") {
      // devolve parada + máquina (como antes)
      return res.json({
        ok: true,
        data: {
          id: paradaFull.id,
          horaInicio: paradaFull.horaInicio,
          horaFinalizacao: paradaFull.horaFinalizacao,
          motivo: paradaFull.motivo,
          equipeAtuando: paradaFull.equipeAtuando,
          observacao: paradaFull.observacao,
          tempoIntervencao: paradaFull.tempoIntervencao,
          tipo: paradaFull.tipo,
          categoria: paradaFull.categoria,
          maquina: {
            id: paradaFull.maquina.id,
            nome: paradaFull.maquina.nome,
            codigo: paradaFull.maquina.codigo,
          },
        },
      });
    }

    if (req.method === "PUT") {
      const {
        motivo,
        equipeAtuando,
        observacao,
        horaInicio,
        horaFinalizacao,
        tipo: rawTipo,
        categoria: rawCat,
      } = (req.body || {}) as {
        motivo?: string;
        equipeAtuando?: string | null;
        observacao?: string | null;
        horaInicio?: string | Date;
        horaFinalizacao?: string | Date | null;
        tipo?: string | null;
        categoria?: string | null;
      };

      // Coerção de datas
      const parsedInicio = horaInicio
        ? new Date(horaInicio)
        : (paradaFull.horaInicio as Date);

      const parsedFim =
        horaFinalizacao === "" ||
        horaFinalizacao === null ||
        typeof horaFinalizacao === "undefined"
          ? null
          : new Date(horaFinalizacao);

      // Coerção de tipo/categoria (mantém os atuais como fallback)
      const currentTipo = (paradaFull.tipo || "OPERACIONAL") as
        | ParadaTipo
        | undefined;
      const currentCat = (paradaFull.categoria || "OUTROS_NAO_OPERACIONAL") as
        | ParadaCategoria
        | undefined;

      const { tipo, categoria } = coerceTipoCategoria(
        rawTipo,
        rawCat,
        currentTipo,
        currentCat
      );

      const dataToUpdate: any = {
        motivo,
        equipeAtuando,
        observacao,
        horaInicio: parsedInicio,
        horaFinalizacao: parsedFim,
        tipo: tipo as any,
        categoria: categoria as any,
      };

      if (parsedFim) {
        // Finalizou → calcula tempoIntervencao
        const diffMin = Math.max(
          0,
          Math.round(
            (parsedFim.getTime() - new Date(parsedInicio).getTime()) / 60000
          )
        );
        dataToUpdate.tempoIntervencao = diffMin;
        dataToUpdate.funcionando = true; // se existir no schema, mantém compat

        // Atualiza parada e RECOMPUTA status da máquina (considera outras abertas)
        await prisma.$transaction(async (tx) => {
          await tx.parada.update({ where: { id }, data: dataToUpdate });

          // Existe outra parada aberta? Se sim, status conforme a categoria dela; se não, ATIVA.
          const aberta = await tx.parada.findFirst({
            where: {
              maquinaId: paradaFull.maquinaId,
              tenantId: paradaTenantId,
              horaFinalizacao: null,
            },
            orderBy: { horaInicio: "desc" },
            select: { categoria: true },
          });

          if (!aberta) {
            await tx.maquina.update({
              where: { id: paradaFull.maquinaId },
              data: { status: "ATIVA" as any },
            });
          } else {
            const cat = (aberta.categoria ||
              "OUTROS_NAO_OPERACIONAL") as ParadaCategoria;
            await tx.maquina.update({
              where: { id: paradaFull.maquinaId },
              data: { status: statusFromCategoria(cat) as any },
            });
          }
        });

        return res.json({ ok: true });
      }

      // Não finalizou → apenas atualiza a parada (inclusive tipo/categoria)
      // e ajusta status da máquina conforme a categoria desta parada aberta
      await prisma.$transaction(async (tx) => {
        await tx.parada.update({ where: { id }, data: dataToUpdate });

        // Como sua regra impede mais de uma aberta por máquina, esta deve ser a "aberta".
        await tx.maquina.update({
          where: { id: paradaFull.maquinaId },
          data: { status: statusFromCategoria(categoria) as any },
        });
      });

      return res.json({ ok: true });
    }

    if (req.method === "DELETE") {
      // Remove a parada e recomputa status da máquina (pode ter outra aberta)
      await prisma.$transaction(async (tx) => {
        await tx.parada.delete({ where: { id } });

        const aberta = await tx.parada.findFirst({
          where: {
            maquinaId: paradaFull.maquinaId,
            tenantId: paradaTenantId,
            horaFinalizacao: null,
          },
          orderBy: { horaInicio: "desc" },
          select: { categoria: true },
        });

        if (!aberta) {
          await tx.maquina.update({
            where: { id: paradaFull.maquinaId },
            data: { status: "ATIVA" as any },
          });
        } else {
          const cat = (aberta.categoria ||
            "OUTROS_NAO_OPERACIONAL") as ParadaCategoria;
          await tx.maquina.update({
            where: { id: paradaFull.maquinaId },
            data: { status: statusFromCategoria(cat) as any },
          });
        }
      });

      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("[/api/paradas/[id]] ERROR:", e);
    return res.status(500).json({ ok: false, error: "Erro na API de parada" });
  }
}
