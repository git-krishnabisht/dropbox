-- Ensure UUID generation extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE file_status AS ENUM ('UPLOADING', 'UPLOADED', 'FAILED');

CREATE TYPE chunk_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- User table
CREATE TABLE
  users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP
    WITH
      TIME ZONE DEFAULT now ()
  );

-- Metadata table
CREATE TABLE
  metadata (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INT NOT NULL CHECK (size >= 0),
    s3_key TEXT UNIQUE NOT NULL,
    status file_status DEFAULT 'UPLOADING',
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMP
    WITH
      TIME ZONE DEFAULT now ()
  );

-- Index for faster lookup by user
CREATE INDEX idx_metadata_user_id ON metadata (user_id);

-- Chunk table
CREATE TABLE
  chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    file_id UUID NOT NULL REFERENCES metadata (file_id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    size INT NOT NULL CHECK (size >= 0),
    checksum TEXT UNIQUE,
    s3_key TEXT UNIQUE NOT NULL,
    status chunk_status DEFAULT 'PENDING',
    created_at TIMESTAMP
    WITH
      TIME ZONE DEFAULT now (),
      CONSTRAINT uq_file_index UNIQUE (file_id, chunk_index)
  );

-- Index for faster lookup by file
CREATE INDEX idx_chunks_file_id ON chunks (file_id);