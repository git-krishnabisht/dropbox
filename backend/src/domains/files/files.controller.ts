import { Request, Response } from "express";
import prisma from "../../shared/utils/prisma.util.js";
import logger from "../../shared/utils/logger.util.js";
import { FileStatus } from "@prisma/client";
import { S3Uploader } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";

const activeUploads = new Map<string, S3Uploader>();

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
      const { numberOfParts, uploadId } = req.body;

      if (!numberOfParts || !uploadId) {
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
      for (let i = 1; i <= numberOfParts; ++i) {
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
      const { uploadId, parts } = req.body;

      if (!uploadId || parts.length <= 0) {
        logger.error(
          "Missing fields in the request while etags comparision",
          req.body
        );
        throw new Error(
          "Missing fields in the request while etags comparision"
        );
      }
      logger.info("Fetched data from the request body", req.body);

      const uploader = activeUploads.get(uploadId);
      if (!uploader) {
        return res.status(404).json({ success: false, error: "Uploader miss" });
      }

      const result = await uploader.completeUpload(parts);
      activeUploads.delete(uploadId);
      logger.info("Deleted uploader from the DB", uploadId);

      if (!result.success) {
        return res
          .status(400)
          .json({ success: false, error: "ETags comparison failed" });
      }

      return res
        .status(200)
        .json({ sucess: true, message: "Sucessfully uploaded file to S3" });
    } catch (err) {
      logger.error("Error while comparing ETags", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        user: req.body,
      });
      return res.status(500).json({ error: "Error while comparing ETags" });
    }
  }
}
