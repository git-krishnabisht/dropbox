/*
  Warnings:

  - A unique constraint covering the columns `[index]` on the table `chunks` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "chunks_index_key" ON "public"."chunks"("index");
