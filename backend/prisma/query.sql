-- Create ENUM types
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'FAILED');

CREATE TYPE "ChunkStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- users table
CREATE TABLE
  "users" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "email" TEXT NOT NULL UNIQUE,
    "name" TEXT,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

-- metadata table (FileMetadata)
CREATE TABLE
  "metadata" (
    "file_id" UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER,
    "s3_key" TEXT NOT NULL UNIQUE,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  );

-- index for FileMetadata.userId
CREATE INDEX "metadata_user_id_idx" ON "metadata" ("user_id");

-- chunks table
CREATE TABLE
  "chunks" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "file_id" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "checksum" TEXT,
    "status" "ChunkStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "metadata" ("file_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chunks_file_id_index_key" UNIQUE ("file_id", "index")
  );

-- index for Chunk.fileId
CREATE INDEX "chunks_file_id_idx" ON "chunks" ("file_id");