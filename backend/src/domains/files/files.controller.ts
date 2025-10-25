import { Request, Response } from "express";
import prisma from "../../shared/utils/prisma.util.js";
import logger from "../../shared/utils/logger.util.js";
import { ChunkStatus, FileStatus } from "@prisma/client";
import { S3Uploader } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";
import { InitUploadResult } from "../../shared/types/common.types.js";
import { rd } from "../../shared/utils/redis.util.js";

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
        return res.status(404).json({
          success: false,
          error: "Missing fileds in the request body",
        });
      }
      logger.info("Fetched data from the request body", req.body);

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

      const uploader = new S3Uploader(config.aws.bucket, s3_key);

      logger.info("Initiating the file upload");
      const init: InitUploadResult = await uploader.initUpload();

      if (init.success === false || init.uploadId === undefined) {
        // delete the filemetadata created from the database and remove the uploader from the Map and abort the s3uplaod or retry based TTL expiry
        return;
      }

      await rd.del(init.uploadId);
      await rd.rpush(init.uploadId, uploader.getBucket());
      await rd.rpush(init.uploadId, uploader.getKey());

      logger.info(
        "Initiation successfull, Updated the uploader with the upload_id in the redis DB",
        init.uploadId
      );

      return res.status(200).send({
        success: true,
        UploadId: init.uploadId,
        message: "File upload initiation successfull",
      });
    } catch (err) {
      // delete the filemetadata created from the database and remove the uploader from the Map and abort the s3uplaod or retry based TTL expiry
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

      const vals: string[] = await rd.lrange(uploadId, 0, -1); // vals = [bucket: string, key: string]
      if (vals.length !== 2) {
        await rd.del(uploadId);
        logger.error(`Value missing in cache for key ${uploadId}`);
        return res
          .status(404)
          .json({ error: `Value missing in cache for key ${uploadId}` });
      }

      const uploader = new S3Uploader(vals[0], vals[1]);
      const urls: string[] = [];

      logger.info("Generating Urls");
      for (let i = 1; i <= _numberOfParts; ++i) {
        const { success, psurl } = await uploader.generatePreSignedUrls(
          i,
          uploadId
        );
        if (success === false || psurl === undefined) {
          // delete the filemetadata created from the database and remove the uploader from the Map and abort the s3uplaod or retry based TTL expiry
          return;
        }
        urls.push(psurl);
      }

      logger.info("Generated Urls successfully", { urls_number: urls.length });
      return res.status(200).json({ presignedUrls: urls });
    } catch (err) {
      // delete the filemetadata created from the database and remove the uploader from the Map and abort the s3uplaod or retry based TTL expiry
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
      const vals: string[] = await rd.lrange(uploadId, 0, -1);
      if (vals.length !== 2) {
        await rd.del(uploadId);
        logger.error(`Value missing in cache for key ${uploadId}`);
        return res
          .status(404)
          .json({ error: `Value missing in cache for key ${uploadId}` });
      }

      const uploader = new S3Uploader(vals[0], vals[1]);
      if (!uploader) {
        return res.status(404).json({ success: false, error: "Uploader miss" });
      }

      const result = await uploader.completeUpload(parts, uploadId);
      await rd.del(uploadId);

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
