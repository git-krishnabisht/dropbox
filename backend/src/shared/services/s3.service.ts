import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
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

  async upload(
    url: string,
    partData: Buffer,
    partNumber: number
  ): Promise<UploadResult> {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: partData,
    });

    const etag: string | null =
      response.headers.get("etag") || response.headers.get("ETag");
    if (!etag) {
      throw new Error("ETag not found in response headers");
    }

    return {
      ETag: etag,
      PartNumber: partNumber
    };
  }

  async completeUpload(parts: UploadResult[]): Promise<void> {
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
