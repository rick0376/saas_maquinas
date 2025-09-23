/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,celular]` on the table `Contato` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Contato_celular_key";

-- CreateIndex
CREATE UNIQUE INDEX "Contato_tenantId_celular_key" ON "Contato"("tenantId", "celular");
