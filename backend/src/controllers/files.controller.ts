import { NextFunction, Request, Response } from "express";
import { generateUploadUrl } from "../services/s3.service.js";
import prisma from "../utils/prisma.util.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger.util.js";

export class fileController {
  static async getSignedUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      logger.info("Get signed URL request received", {
        filename: req.body.filename,
        mimeType: req.body.mimeType,
        userId,
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
      const s3Key = `dropbox-test/${userId}/${fileId}-${filename}`;

      logger.info("Creating metadata record", {
        fileId,
        filename,
        s3Key,
        userId,
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
}
