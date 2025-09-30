/*
  Warnings:

  - A unique constraint covering the columns `[checksum]` on the table `chunks` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."chunks" ADD COLUMN     "checksum" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "chunks_checksum_key" ON "public"."chunks"("checksum");
