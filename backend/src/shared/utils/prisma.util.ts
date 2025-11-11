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

export async function deleteChunks(id: string) {
  await prisma.chunk.deleteMany({
    where: {
      fileId: id,
    },
  });
  logger.info(`Deleted chunks with file_id: ${id}`);
}

export async function recordUploadedMetadata(id: string) {
  await prisma.fileMetadata.update({
    where: { fileId: id },
    data: { status: FileStatus.UPLOADED },
  });
  logger.info(`Updated metadata status with file_id: ${id}`);
}

export async function recordFailedMetadata(id: string) {
  await prisma.fileMetadata.update({
    where: { fileId: id },
    data: { status: FileStatus.FAILED },
  });
  logger.info(`Updated metadata status with file_id: ${id}`);
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
  logger.info(`Created metadata with file_id: ${file_id}`);
}

export async function createPendingChunk(
  file_id: string,
  chunk_index: number,
  size: number,
  s3_key: string,
  etag?: string
) {
  await prisma.chunk.create({
    data: {
      fileId: file_id,
      chunkIndex: chunk_index,
      size: size,
      s3Key: s3_key,
      checksum: etag,
    },
  });
  logger.info(`Created chunk at index: ${chunk_index}, with PENDING status`);
}

export async function updateChunk(
  file_id: string,
  chunk_index: number,
  etag: string
) {
  await prisma.chunk.update({
    where: {
      fileId_chunkIndex: {
        fileId: file_id,
        chunkIndex: chunk_index,
      },
    },
    data: {
      checksum: etag,
      status: ChunkStatus.COMPLETED,
    },
  });
  logger.info(`Updated chunk at index: ${chunk_index}, with COMPLETED status`);
}

export async function recordFailedChunkOne(
  file_id: string,
  chunk_index: number
) {
  await prisma.chunk.update({
    where: {
      fileId_chunkIndex: {
        fileId: file_id,
        chunkIndex: chunk_index,
      },
    },
    data: {
      status: ChunkStatus.FAILED,
    },
  });
  logger.info(`Updated chunk at index: ${chunk_index}, with FAILED status`);
}

export async function recordFailedChunkMany(file_id: string) {
  await prisma.chunk.updateMany({
    where: {
      fileId: file_id,
    },
    data: {
      status: ChunkStatus.FAILED,
    },
  });

  logger.info(`Update all chunks status to FAILED with file_id: ${file_id}`);
}
