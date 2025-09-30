import { Request, Response } from "express";
import prisma from "../../shared/utils/prisma.util.js";
import logger from "../../shared/utils/logger.util.js";
import { ChunkStatus, FileStatus } from "@prisma/client";
import { S3Uploader } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";

const activeUploads = new Map<string, S3Uploader>(); // can use redis or sqlite

export class fileController {
  static async uploadInit(req: Request, res: Response) {
    try {
      const { file_id, file_name, file_type, file_size, user_id, s3_key } =
        req.body;

      if (
        !file_id ||
        !file_name ||
        !file_type ||
        !file_size ||
        !user_id ||
        !s3_key
      ) {
        logger.error(
          "Missing fields in the request while initiating the file upload",
          req.body
        );
        return res
          .status(404)
          .json({ sucess: false, error: "Missing fileds in the request body" });
      }
      logger.info("Fetched data from the request body", req.body);

      const uploader = new S3Uploader(config.aws.bucket, s3_key);

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
      logger.info(
        "Uploaded FileMetadata to DB while initiating the file upload",
        req.body.file_id
      );

      logger.info("Initiating the file upload");
      const upload_id: string = await uploader.initUpload();
      activeUploads.set(upload_id, uploader);
      logger.info(
        "Initiation successfull, Updated the uploader with the upload_id in the redis DB",
        upload_id
      );

      return res.status(200).send({
        success: true,
        UploadId: upload_id,
        message: "File upload initiation successfull",
      });
    } catch (err) {
      logger.error("Error Initiating the file upload", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        user: req.body,
      });
      return res
        .status(500)
        .json({ error: "Error Initiating the file upload" });
    }
  }

  static async getPresignedUrls(req: Request, res: Response) {
    try {
      const { uploadId, numberOfParts } = req.body;
      const _numberOfParts = parseInt(numberOfParts, 10);

      if (!_numberOfParts || !uploadId) {
        logger.error(
          "Missing fields in the request while getting presigned urls",
          req.body
        );
        return res
          .status(404)
          .json({ error: "Missing fileds in the request body" });
      }
      logger.info("Fetched data from the request body", req.body);

      const urls: string[] = [];
      const uploader = activeUploads.get(uploadId);
      if (!uploader) {
        return res.status(404).json({ error: "Uploader miss" });
      }

      logger.info("Generating Urls");
      for (let i = 1; i <= _numberOfParts; ++i) {
        const url = await uploader.generatePreSignedUrls(i);
        urls.push(url);
      }
      logger.info("Generated Urls successfully", { urls_number: urls.length });

      return res.status(200).json({ presignedUrls: urls });
    } catch (err) {
      logger.error("Error Generating Urls", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        user: req.body,
      });
      return res.status(500).json({ error: "Error Generating Urls" });
    }
  }

  static async completeUpload(req: Request, res: Response) {
    try {
      const { uploadId, parts, fileId } = req.body;

      if (!uploadId || parts.length <= 0 || !fileId) {
        logger.error(
          "Missing fields in the request while completing upload",
          req.body
        );
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
      }

      const uploader = activeUploads.get(uploadId);
      if (!uploader) {
        return res.status(404).json({ success: false, error: "Uploader miss" });
      }

      const result = await uploader.completeUpload(parts);
      activeUploads.delete(uploadId);

      if (!result.success) {
        return res
          .status(400)
          .json({ success: false, error: "ETags comparison failed" });
      }

      await prisma.fileMetadata.update({
        where: { fileId: fileId },
        data: { status: FileStatus.UPLOADED },
      });

      return res
        .status(200)
        .json({ success: true, message: "Successfully uploaded file to S3" });
    } catch (err) {
      logger.error("Error while completing upload", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        body: req.body,
      });
      return res.status(500).json({ error: "Error while completing upload" });
    }
  }

  static async recordChunkUpload(req: Request, res: Response) {
    try {
      const { file_id, chunk_index, size, etag, s3_key } = req.body;

      if (!file_id || chunk_index === undefined || !size || !s3_key) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
      }

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

      return res.status(200).json({ success: true });
    } catch (err: any) {
      logger.error("Error recording chunk upload", {
        error: err.message,
        code: err.code,
      });

      if (err.code === "P2002") {
        return res.status(409).json({
          success: false,
          error: "Chunk already recorded",
        });
      }

      return res.status(500).json({
        success: false,
        error: "Failed to record chunk",
      });
    }
  }
}
