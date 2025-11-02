import prisma from "../config/prisma.config";
import logger from "./logger.util";
import { FileStatus, ChunkStatus } from "@prisma/client";

export async function deleteFileMetadata(id: string) {
  await prisma.fileMetadata.delete({
    where: {
      fileId: id,
    },
  });

  logger.info(`Deleted FileMetadata with file_id: ${id}`);
}

export async function updateStatusFileMetadata(id: string) {
  await prisma.fileMetadata.update({
    where: { fileId: id },
    data: { status: FileStatus.UPLOADED },
  });
}

export async function createFileMetadata(
  file_id: string,
  file_name: string,
  file_type: string,
  file_size: string,
  s3_key: string,
  user_id: string
) {
  await prisma.fileMetadata.create({
    data: {
      fileId: file_id,
      fileName: file_name,
      mimeType: file_type,
      size: parseInt(file_size, 10),
      s3Key: s3_key,
      status: FileStatus.UPLOADING,
      userId: user_id,
    },
  });
}

export async function createChunk(
  file_id: string,
  chunk_index: number,
  size: number,
  s3_key: string,
  etag: string
) {
  await prisma.chunk.create({
    data: {
      fileId: file_id,
      chunkIndex: chunk_index,
      size: size,
      s3Key: s3_key,
      checksum: etag,
      status: ChunkStatus.COMPLETED,
    },
  });
}
