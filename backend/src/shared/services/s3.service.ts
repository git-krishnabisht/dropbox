import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.util.js";

const s3 = new S3Client({
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

export interface UploadResult {
  ETag: string;
  PartNumber: number;
}

export class S3Uploader {
  private bucket: string;
  private key: string;
  private uploadId: string | null = null;

  constructor(bucket: string, key: string) {
    this.bucket = bucket;
    this.key = key;
  }

  async initUpload(): Promise<string> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: this.key,
      ContentType: "application/octet-stream",
    });

    const res = await s3.send(command);
    this.uploadId = res.UploadId!;
    return this.uploadId;
  }

  async generatePreSignedUrls(partNumber: number): Promise<string> {
    if (!this.uploadId) {
      throw new Error("Multipart upload not initiated");
    }

    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: this.key,
      PartNumber: partNumber,
      UploadId: this.uploadId,
    });

    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  }

  async completeUpload(parts: UploadResult[]): Promise<{ success: Boolean }> {
    if (!this.uploadId) {
      throw new Error("Multipart upload not initiated");
    }

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: this.key,
      UploadId: this.uploadId,
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

  async abortUpload(): Promise<void> {
    if (!this.uploadId) {
      return;
    }

    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: this.key,
      UploadId: this.uploadId,
    });

    await s3.send(command);
  }
}
