import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutBucketCorsCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.util.js";
import {
  GetPSURLResult,
  InitUploadResult,
  UploadResult,
} from "../types/common.types.js";

export const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

export async function configureBucketCORS() {
  try {
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
          AllowedOrigins: ["http://localhost:5173", "http://localhost:4173"],
          ExposeHeaders: ["ETag", "x-amz-request-id", "x-amz-version-id"],
          MaxAgeSeconds: 3000,
        },
      ],
    };

    const command = new PutBucketCorsCommand({
      Bucket: config.aws.bucket,
      CORSConfiguration: corsConfiguration,
    });

    await s3.send(command);

    logger.info("S3 bucket CORS configuration updated successfully", {
      bucket: config.aws.bucket,
    });
  } catch (error) {
    logger.error("Failed to configure S3 bucket CORS", {
      error: error instanceof Error ? error.message : error,
      bucket: config.aws.bucket,
    });
    throw error;
  }
}

export class S3Uploader {
  private bucket: string;
  private key: string;

  constructor(bucket: string, key: string) {
    this.bucket = bucket;
    this.key = key;
  }

  getBucket() {
    return this.bucket;
  }
  getKey() {
    return this.key;
  }

  async initUpload(): Promise<InitUploadResult> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: this.key,
      ContentType: "application/octet-stream",
    });

    const res = await s3.send(command);
    if (!res.UploadId) return { success: false };
    return { success: true, uploadId: res.UploadId };
  }

  async generateUploadUrls(
    partNumber: number,
    uploadId: string
  ): Promise<GetPSURLResult> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: this.key,
      PartNumber: partNumber,
      UploadId: uploadId,
    });

    const url: string = await getSignedUrl(s3, command, { expiresIn: 3600 });
    if (!url || url === undefined) {
      return { success: false };
    }
    return { success: true, psurl: url };
  }

  async completeUpload(
    parts: UploadResult[],
    uploadId: string
  ): Promise<{ success: Boolean }> {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: this.key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part: UploadResult) => ({
          ETag: part.ETag,
          PartNumber: part.PartNumber,
        })),
      },
    });

    await s3.send(command);
    return { success: true };
  }

  async abortUpload(uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: this.key,
      UploadId: uploadId,
    });

    await s3.send(command);
  }
}
