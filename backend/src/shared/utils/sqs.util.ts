import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { config } from "../config/env.config.js";
import logger from "./logger.util.js";
import prisma from "./prisma.util.js";
import { FileStatus } from "@prisma/client";

const queueUrl = config.aws.sqs;

export const sqs = new SQSClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

export function tryParseJson<T = any>(
  raw: string | undefined | null
): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function extractS3Records(messageBody: any): any[] {
  if (messageBody?.Event === "s3:TestEvent") {
    logger.info("Received S3 test event - connection is working", {
      bucket: messageBody.Bucket,
      service: messageBody.Service,
      time: messageBody.Time,
    });
    return [];
  }

  if (Array.isArray(messageBody?.Records)) {
    return messageBody.Records;
  }

  /* Cofigured for SNS: but not used */
  if (
    messageBody?.Type === "Notification" &&
    typeof messageBody?.Message === "string"
  ) {
    const inner = tryParseJson(messageBody.Message);
    if (Array.isArray(inner?.Records)) {
      return inner.Records;
    }
  }

  /* Cofigured for AWS eventbridge: but not used */
  if (
    messageBody?.detail?.requestParameters?.bucketName &&
    messageBody?.detail?.requestParameters?.key
  ) {
    const bucket = messageBody.detail.requestParameters.bucketName;
    const key = messageBody.detail.requestParameters.key as string;
    return [
      {
        s3: {
          bucket: { name: bucket },
          object: { key },
        },
      },
    ];
  }

  return [];
}

export function decodeS3Key(rawKey: string): string {
  const plusNormalized = rawKey.replace(/\+/g, "%20");
  try {
    console.log(
      "here the s3 Key found is: ",
      decodeURIComponent(plusNormalized)
    );
    return decodeURIComponent(plusNormalized);
  } catch {
    logger.warn("Failed to decode S3 key, using raw key", { rawKey });
    return rawKey;
  }
}

export async function testQueueAccess(): Promise<boolean> {
  try {
    logger.info("Testing SQS queue access", { queueUrl });

    await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 1,
      })
    );

    logger.info("SQS queue access test successful");
    return true;
  } catch (error: any) {
    logger.error("SQS queue access test failed", {
      error: error.message,
      code: error.Code,
      queueUrl,
    });
    return false;
  }
}

export async function deleteMessage(receiptHandle: string) {
  try {
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      })
    );
  } catch (error: any) {
    logger.error("Failed to delete SQS message", {
      error: error.message,
      receiptHandle,
    });
  }
}

export async function processS3Record(record: any, messageId?: string) {
  const rawKey: string | undefined = record?.s3?.object?.key;
  if (!rawKey) {
    logger.warn("Record missing S3 object key", { record, messageId });
    return;
  }

  const s3Key = decodeS3Key(rawKey);
  const size = record?.s3?.object?.size;
  const eventName = record?.eventName;

  logger.info("Processing S3 record", {
    s3Key,
    eventName,
    size,
    messageId,
  });

  try {
    const existing = await prisma.fileMetadata.findUnique({
      where: { s3Key },
    });

    if (!existing) {
      logger.warn("No metadata record found for S3 key", { s3Key, messageId });
      return;
    }

    const updated = await prisma.fileMetadata.update({
      where: { s3Key },
      data: {
        status: FileStatus.UPLOADED,
        ...(size && { size: parseInt(size) }),
      },
    });

    logger.info("Successfully updated metadata status", {
      s3Key,
      fileId: updated.fileId,
      oldStatus: existing.status,
      newStatus: updated.status,
      size: updated.size,
      messageId,
    });
  } catch (dbErr: any) {
    logger.error("Failed to update metadata for S3 key", {
      s3Key,
      error: dbErr?.message ?? String(dbErr),
      code: dbErr?.code,
      messageId,
    });
    throw dbErr;
  }
}
