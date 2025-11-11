-- DropForeignKey
ALTER TABLE "public"."chunks" DROP CONSTRAINT "chunks_file_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."chunks" ADD CONSTRAINT "chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."metadata"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;
