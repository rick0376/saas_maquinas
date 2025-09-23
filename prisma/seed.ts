import { PrismaClient, MaqStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { name: "LHP Máquinas" },
    update: {},
    create: { name: "LHP Máquinas" },
  });

  const [adminPass, superPass, userPass] = await Promise.all([
    bcrypt.hash("admin123", 10),
    bcrypt.hash("superadmin123", 10),
    bcrypt.hash("user123", 10),
  ]);

  await prisma.user.upsert({
    where: { email: "admin@lhp.com" },
    update: {},
    create: {
      email: "admin@lhp.com",
      name: "Admin LHP",
      password: adminPass,
      role: "ADMIN",
      tenantId: tenant.id,
    },
  });
  await prisma.user.upsert({
    where: { email: "superadmin@lhp.com" },
    update: {},
    create: {
      email: "superadmin@lhp.com",
      name: "Super Admin",
      password: superPass,
      role: "SUPERADMIN",
      tenantId: tenant.id,
    },
  });
  await prisma.user.upsert({
    where: { email: "user@lhp.com" },
    update: {},
    create: {
      email: "user@lhp.com",
      name: "Usuário LHP",
      password: userPass,
      role: "USER",
      tenantId: tenant.id,
    },
  });

  const planta = await prisma.secao.create({
    data: {
      tenantId: tenant.id,
      nome: "Planta Principal",
      descricao: "Matriz",
    },
  });
  const setorA = await prisma.secao.create({
    data: {
      tenantId: tenant.id,
      nome: "Setor A",
      descricao: "Montagem",
      paiId: planta.id,
    },
  });
  const celula01 = await prisma.secao.create({
    data: {
      tenantId: tenant.id,
      nome: "Célula 01",
      descricao: "Robótica",
      paiId: setorA.id,
    },
  });

  const m1 = await prisma.maquina.create({
    data: {
      tenantId: tenant.id,
      codigo: "MX-100",
      nome: "Torno CNC A",
      status: MaqStatus.ATIVA,
      secaoId: celula01.id,
    },
  });
  const m2 = await prisma.maquina.create({
    data: {
      tenantId: tenant.id,
      codigo: "MX-101",
      nome: "Centro Usinagem B",
      status: MaqStatus.MANUTENCAO,
      secaoId: setorA.id,
    },
  });
  const m3 = await prisma.maquina.create({
    data: {
      tenantId: tenant.id,
      codigo: "MX-102",
      nome: "Prensa Hidráulica",
      status: MaqStatus.PARADA,
      secaoId: planta.id,
    },
  });

  const now = new Date();
  const start1 = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const end1 = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  await prisma.parada.create({
    data: {
      tenantId: tenant.id,
      maquinaId: m1.id,
      horaInicio: start1,
      horaFinalizacao: end1,
      motivo: "Troca de ferramenta",
      equipeAtuando: "Manutenção",
      observacao: "OK",
      tempoIntervencao: Math.floor((end1.getTime() - start1.getTime()) / 1000),
      funcionando: false,
    },
  });

  const start2 = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  await prisma.parada.create({
    data: {
      tenantId: tenant.id,
      maquinaId: m3.id,
      horaInicio: start2,
      motivo: "Falha elétrica",
      equipeAtuando: "Elétrica",
      observacao: "Aguardando peça",
      funcionando: false,
    },
  });

  await prisma.contato.createMany({
    data: [
      { tenantId: tenant.id, nome: "João", celular: "+550000000001" },
      { tenantId: tenant.id, nome: "Maria", celular: "+550000000002" },
    ],
    skipDuplicates: true,
  });

  console.log("Seed completo ✅");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
