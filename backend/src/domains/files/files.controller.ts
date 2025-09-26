import { Request, Response } from "express";
import {
  generateDownloadUrl,
  generateUploadUrl,
} from "../../shared/services/s3.service.js";
import prisma from "../../shared/utils/prisma.util.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../../shared/utils/logger.util.js";

export class fileController {
  static async getSignedUploadUrl(req: Request, res: Response) {
    try {
      logger.info("Get signed URL for file upload request received", {
        filename: req.body.filename,
        mimeType: req.body.mimeType,
      });

      const { filename, mimeType } = req.body;
      if (!filename || !mimeType) {
        logger.warn("Missing required fields in get signed URL request", {
          body: req.body,
        });
        return res
          .status(400)
          .json({ error: "filename and mimeType are required" });
      }

      const fileId = uuidv4();
      const s3Key = `dropbox-test/${fileId}-${filename}`;

      logger.info("Creating metadata record", {
        fileId,
        filename,
        s3Key,
      });

      await prisma.metadata.create({
        data: {
          fileId,
          fileName: filename,
          mimeType: mimeType,
          size: null,
          s3Key,
          status: "pending",
        },
      });

      logger.info("Generating S3 upload URL", { fileId, s3Key });
      const url = await generateUploadUrl(s3Key as string, mimeType as string);

      logger.info("Successfully generated upload URL", { fileId, s3Key });
      res.json({ uploadUrl: url, fileId });
    } catch (err) {
      logger.error("Error generating pre-signed URL", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        filename: req.body.filename,
      });
      res.status(500).json({ error: "Could not generate upload URL" });
    }
  }

  static async getSignedDownloadUrl(req: Request, res: Response) {
    try {
      logger.info("Get signed URL for file download request received", {
        s3Key: req.body.s3Key,
      });

      const { s3Key } = req.body;
      if (!s3Key) {
        logger.warn("Missing required fields in get signed URL request", {
          body: req.body,
        });
        return res.status(400).json({ error: "s3Key string is required" });
      }

      logger.info("Generating S3 download URL", { s3Key });
      const url = await generateDownloadUrl(s3Key as string);

      logger.info("Successfully generated download URL", { s3Key });
      res.json({ downloadUrl: url });
    } catch (err) {
      logger.error("Error generating pre-signed URL", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        s3Key: req.body.s3Key,
      });
      res.status(500).json({ error: "Could not generate download URL" });
    }
  }
}
