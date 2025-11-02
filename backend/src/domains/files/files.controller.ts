import type { Request, Response } from "express";
import logger from "../../shared/utils/logger.util.js";
import { S3Uploader } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";
import { InitUploadResult } from "../../shared/types/common.types.js";
import { rd } from "../../shared/utils/redis.util.js";
import {
  createChunk,
  createFileMetadata,
  deleteFileMetadata,
  updateStatusFileMetadata,
  deleteChunks,
} from "../../shared/utils/prisma.util.js";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB
const REDIS_TTL = 24 * 60 * 60; // 24 hours

interface GetUrlsRequestBody {
  file_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  user_id: string;
  s3_key: string;
}

interface CompleteUploadRequestBody {
  uploadId: string;
  parts: Array<{ PartNumber: number; ETag: string }>;
  fileId: string;
}

interface RecordChunkRequestBody {
  upload_id: string;
  file_id: string;
  chunk_index: number;
  size: string;
  etag: string;
  s3_key: string;
}

export class fileController {
  private static validateGetUrlsRequest(body: any): body is GetUrlsRequestBody {
    return (
      body.file_id &&
      body.file_name &&
      body.file_type &&
      body.file_size &&
      body.user_id &&
      body.s3_key
    );
  }

  private static validateCompleteUploadRequest(
    body: any
  ): body is CompleteUploadRequestBody {
    return (
      body.uploadId &&
      Array.isArray(body.parts) &&
      body.parts.length > 0 &&
      body.fileId
    );
  }

  private static validateRecordChunkRequest(
    body: any
  ): body is RecordChunkRequestBody {
    return (
      body.file_id &&
      typeof body.chunk_index === "number" &&
      body.chunk_index >= 0 &&
      body.size &&
      body.s3_key &&
      body.etag
    );
  }

  private static async cleanupFailedUpload(
    fileId: string,
    uploadId: string | null,
    uploader: S3Uploader
  ): Promise<void> {
    try {
      await deleteFileMetadata(fileId);
      await deleteChunks(fileId);
      if (uploadId) {
        await uploader.abortUpload(uploadId);
        await rd.del(uploadId);
      }
    } catch (err) {
      logger.error("Error during cleanup", {
        error: err instanceof Error ? err.message : String(err),
        fileId,
        uploadId,
      });
    }
  }

  static async getUrls(req: Request, res: Response) {
    if (!fileController.validateGetUrlsRequest(req.body)) {
      logger.error("Missing or invalid fields in request", req.body);
      return res.status(400).json({
        success: false,
        error: "Missing or invalid required fields",
      });
    }

    const { file_id, file_name, file_type, file_size, user_id, s3_key } =
      req.body;

    const uploader = new S3Uploader(config.aws.bucket, s3_key);
    let uploadId: string | null = null;

    try {
      const fileSizeBytes = parseInt(file_size, 10);
      if (isNaN(fileSizeBytes) || fileSizeBytes <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid file size",
        });
      }

      if (fileSizeBytes > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          error: `File size exceeds maximum allowed size of ${
            MAX_FILE_SIZE / (1024 * 1024 * 1024)
          }GB`,
        });
      }

      logger.info("Fetched data from request body", req.body);

      logger.info("Initiating file upload");
      const init: InitUploadResult = await uploader.initUpload();

      if (!init.success || !init.uploadId) {
        logger.error("Failed to initialize upload", { init });
        throw new Error("Failed to initialize upload");
      }

      uploadId = init.uploadId;
      const numParts = Math.ceil(fileSizeBytes / CHUNK_SIZE);

      logger.info("Number of parts calculated", { numParts });

      const urls: string[] = [];
      logger.info("Generating presigned URLs...");

      for (let i = 1; i <= numParts; i++) {
        const { success, psurl } = await uploader.generatePreSignedUrls(
          i,
          uploadId
        );

        if (!success || !psurl) {
          logger.error("Failed to generate presigned URL", { partNumber: i });
          throw new Error(`Failed to generate presigned URL for part ${i}`);
        }

        urls.push(psurl);
      }

      if (urls.length !== numParts) {
        throw new Error(
          `URL count mismatch: expected ${numParts}, got ${urls.length}`
        );
      }

      // Store upload metadata in Redis with TTL
      await rd.set(
        uploadId,
        JSON.stringify({
          bucket: uploader.getBucket(),
          key: uploader.getKey(),
        }),
        "EX",
        REDIS_TTL
      );

      await createFileMetadata(
        file_id,
        file_name,
        file_type,
        file_size,
        s3_key,
        user_id
      );

      logger.info("Generated S3 presigned URLs successfully", {
        fileId: file_id,
        uploadId,
        urlCount: urls.length,
      });

      return res.status(200).json({
        success: true,
        presignedUrls: urls,
        uploadId,
      });
    } catch (err) {
      logger.error("Error generating S3 presigned URLs", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        fileId: file_id,
      });

      await fileController.cleanupFailedUpload(file_id, uploadId, uploader);

      return res.status(500).json({
        success: false,
        error: "Error generating S3 presigned URLs",
      });
    }
  }

  static async completeUpload(req: Request, res: Response) {
    if (!fileController.validateCompleteUploadRequest(req.body)) {
      logger.error("Missing or invalid fields in request", req.body);
      return res.status(400).json({
        success: false,
        error: "Missing or invalid required fields",
      });
    }

    const { uploadId, parts, fileId } = req.body;

    try {
      const cachedData = await rd.get(uploadId);
      if (!cachedData) {
        logger.error("Upload metadata not found in cache", { uploadId });
        return res.status(404).json({
          success: false,
          error: "Upload session not found or expired",
        });
      }

      const { bucket, key } = JSON.parse(cachedData);
      const uploader = new S3Uploader(bucket, key);

      const result = await uploader.completeUpload(parts, uploadId);

      if (!result.success) {
        logger.error("Upload completion failed", { uploadId, fileId });
        await uploader.abortUpload(uploadId);
        await rd.del(uploadId);
        return res.status(400).json({
          success: false,
          error: "Failed to complete upload: ETags comparison failed",
        });
      }

      await updateStatusFileMetadata(fileId);
      await rd.del(uploadId);

      logger.info("File uploaded successfully", { fileId, uploadId });

      return res.status(200).json({
        success: true,
        message: "Successfully uploaded file to S3",
      });
    } catch (err) {
      logger.error("Error while completing upload", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        uploadId,
        fileId,
      });

      try {
        const cachedData = await rd.get(uploadId);
        if (cachedData) {
          const { bucket, key } = JSON.parse(cachedData);
          const uploader = new S3Uploader(bucket, key);
          await uploader.abortUpload(uploadId);
        }
        await rd.del(uploadId);
      } catch (cleanupErr) {
        logger.error("Error during upload completion cleanup", {
          error:
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr),
        });
      }

      return res.status(500).json({
        success: false,
        error: "Error while completing upload",
      });
    }
  }

  static async recordChunkUpload(req: Request, res: Response) {
    if (!fileController.validateRecordChunkRequest(req.body)) {
      logger.error("Missing or invalid fields in request", req.body);
      return res.status(400).json({
        success: false,
        error: "Missing or invalid required fields",
      });
    }

    const { file_id, chunk_index, size, etag, s3_key } = req.body;

    try {
      await createChunk(file_id, chunk_index, parseInt(size, 10), s3_key, etag);

      logger.info("Chunk recorded successfully", {
        fileId: file_id,
        chunkIndex: chunk_index,
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      deleteFileMetadata(file_id);
      deleteChunks(file_id);
      logger.error("Error recording chunk upload", {
        error: err instanceof Error ? err.message : String(err),
        code: err instanceof Error && "code" in err ? err.code : undefined,
        fileId: file_id,
        chunkIndex: chunk_index,
      });

      return res.status(500).json({
        success: false,
        error: "Error recording chunk upload",
      });
    }
  }
}
