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
} from "../../shared/utils/prisma.util.js";

export class fileController {
  static async getUrls(req: Request, res: Response) {
    const { file_id, file_name, file_type, file_size, user_id, s3_key } =
      req.body;
    try {
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
        throw new Error("Missing required fields");
      }

      logger.info("Fetched data from the request body", req.body);

      const uploader = new S3Uploader(config.aws.bucket, s3_key);

      logger.info("Initiating the file upload");
      const init: InitUploadResult = await uploader.initUpload();

      if (
        init.success === false ||
        init.uploadId === undefined ||
        !init.uploadId
      ) {
        logger.error("uploadId is either null or undefined");
        throw new Error("Null or Undefined: uploadId");
      }
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

      const nops: number = Math.ceil(parseInt(file_size, 10) / CHUNK_SIZE); // nops = number of parts

      logger.info("the number of parts are", nops);

      const urls: string[] = [];
      logger.info("Generating Urls....");

      for (let i = 1; i <= nops; ++i) {
        const { success, psurl } = await uploader.generatePreSignedUrls(
          i,
          init.uploadId
        );

        if (success === false || psurl === undefined) {
          logger.error("Something went wrong");
          throw new Error("Something went wrong");
        }

        urls.push(psurl);
      }

      if (urls.length !== nops) {
        deleteFileMetadata(file_id);
        throw new Error("Something went wrong");
      }

      await rd.del(init.uploadId);
      await rd.set(
        init.uploadId,
        JSON.stringify({
          bucket: uploader.getBucket(),
          key: uploader.getKey(),
        })
      );

      await createFileMetadata(
        file_id,
        file_name,
        file_type,
        file_size,
        s3_key,
        user_id
      );

      logger.info("Generated S3 Pre-Signed Urls Sucessfully");

      return res.status(200).json({
        success: true,
        presignedUrls: urls,
        uploadId: init.uploadId,
      });
    } catch (err) {
      deleteFileMetadata(file_id);
      logger.error("Error Generating S3 Pre-Signed Urls", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        user: req.body,
      });
      return res.status(500).json({
        error: "Error Generating S3 Pre-Signed Urls",
      });
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

      const cachedData = await rd.get(uploadId);
      if (!cachedData) {
        logger.error(`Value missing in cache for key ${uploadId}`);
        return res.status(404).json({
          error: `Value missing in cache for key ${uploadId}`,
        });
      }

      const { bucket, key } = JSON.parse(cachedData);
      const uploader = new S3Uploader(bucket, key);
      const result = await uploader.completeUpload(parts, uploadId);

      await rd.del(uploadId);

      if (!result.success) {
        return res
          .status(400)
          .json({ success: false, error: "ETags comparison failed" });
      }

      await updateStatusFileMetadata(fileId);

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
    const { file_id, chunk_index, size, etag, s3_key } = req.body;
    try {
      if (!file_id || chunk_index === undefined || !size || !s3_key) {
        logger.error("Missing required fields", req.body);
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
        });
      }

      await createChunk(file_id, chunk_index, size, s3_key, etag); // cause conflict, reason: unique key-etag

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
