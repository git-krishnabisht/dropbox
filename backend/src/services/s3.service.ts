import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.js";

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

export async function generateUploadUrl(key: string, contentType: string) {
  try {
    logger.info("Generating S3 upload URL", { key, contentType });

    const command = new PutObjectCommand({
      Bucket: config.aws.bucket,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 900 });

    logger.info("S3 upload URL generated successfully", {
      key,
      bucket: config.aws.bucket,
    });
    return url;
  } catch (error) {
    logger.error("Error generating S3 upload URL", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      key,
      contentType,
    });
    throw error;
  }
}

export async function generateDownloadUrl(s3Key: string) {
  try {
    logger.info("Generating S3 download URL", { s3Key });

    const command = new GetObjectCommand({
      Bucket: config.aws.bucket,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 900 });

    logger.info("S3 download URL generated successfully", {
      s3Key,
      bucket: config.aws.bucket,
    });
    return url;
  } catch (error) {
    logger.error("Error generating S3 download URL", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      s3Key,
    });
    throw error;
  }
}
