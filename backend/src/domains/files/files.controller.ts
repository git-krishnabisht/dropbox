import { Request, Response } from "express";
import prisma from "../../shared/utils/prisma.util.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../../shared/utils/logger.util.js";
import { FileStatus } from "@prisma/client";
import { S3Uploader, UploadResult } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";

const activeUploads = new Map<string, S3Uploader>();

export class fileController {
  static async uploadInit(req: Request, res: Response) {
    try {
      const { file_id, file_name, file_type, file_size, user_id, s3_key } =
        req.body;
      const uploader = new S3Uploader(config.aws.bucket, s3_key as string);
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
      const upload_id: string = await uploader.initUpload();
      activeUploads.set(upload_id, uploader);
      return res.json({ success: true, UploadId: upload_id });
    } catch (error) {}
  }

  static async getPresignedUrls(req: Request, res: Response) {
    try {
      const { numberOfParts, uploadId } = {
        ...req.body,
        uploadId: Number(req.body.uploadId),
      };

      const urls: string[] = [];
      const uploader = activeUploads.get(uploadId);
      for (let i = 1; i <= numberOfParts; ++i) {
        const url: string = await uploader?.generatePreSignedUrls(i)!;
        urls.push(url);
      }

      return res.json({ presignedUrls: urls });
    } catch (error) {}
  }

  static async completeUpload(arg0: string, completeUpload: any) {
    throw new Error("Method not implemented.");
  }
}
