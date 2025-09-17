import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import prisma from "../utils/prisma.util.js";
import { sqs } from "../utils/sqs.util.js";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.util.js";

const queueUrl = config.aws.sqs;

function tryParseJson<T = any>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractS3Records(messageBody: any): any[] {
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

  if (
    messageBody?.Type === "Notification" &&
    typeof messageBody?.Message === "string"
  ) {
    const inner = tryParseJson(messageBody.Message);
    if (Array.isArray(inner?.Records)) {
      return inner.Records;
    }
  }

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

function decodeS3Key(rawKey: string): string {
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

async function testQueueAccess(): Promise<boolean> {
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

async function pollS3Events() {
  if (!queueUrl) {
    logger.error("SQS_QUEUE_URL is not configured. SQS polling disabled.");
    return;
  }

  const hasAccess = await testQueueAccess();
  if (!hasAccess) {
    logger.error(
      "Cannot access SQS queue. Check your credentials, queue URL, and IAM permissions."
    );
    return;
  }

  logger.info("Starting SQS polling for S3 events", { queueUrl });

  while (true) {
    try {
      const { Messages } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 20,
        })
      );

      if (!Messages || Messages.length === 0) {
        logger.debug("No messages received from SQS");
        continue;
      }

      logger.info("Received SQS messages", { count: Messages.length });

      for (const msg of Messages) {
        logger.info("Processing SQS message", {
          messageId: msg.MessageId,
          body: tryParseJson(msg.Body),
        });

        try {
          const parsedBody = tryParseJson<any>(msg.Body!);
          if (!parsedBody) {
            logger.warn("Failed to parse SQS message body", {
              messageId: msg.MessageId,
              rawBody: msg.Body,
            });
            await deleteMessage(msg.ReceiptHandle!);
            continue;
          }

          const records = extractS3Records(parsedBody);
          if (!records || records.length === 0) {
            if (parsedBody?.Event === "s3:TestEvent") {
              logger.info("S3 test event processed successfully");
              await deleteMessage(msg.ReceiptHandle!);
              continue;
            }

            logger.warn("SQS message missing Records array", {
              messageId: msg.MessageId,
              messageType: parsedBody?.Event || parsedBody?.Type || "unknown",
              eventName: parsedBody?.eventName,
              bucket: parsedBody?.bucket || parsedBody?.Bucket,
            });
            await deleteMessage(msg.ReceiptHandle!);
            continue;
          }

          logger.info("Found S3 records in message", {
            messageId: msg.MessageId,
            recordCount: records.length,
          });

          for (const record of records) {
            await processS3Record(record, msg.MessageId);
          }

          await deleteMessage(msg.ReceiptHandle!);
          logger.info("Successfully processed and deleted SQS message", {
            messageId: msg.MessageId,
          });
        } catch (msgErr: any) {
          logger.error("Error processing SQS message", {
            messageId: msg.MessageId,
            error: msgErr?.message ?? String(msgErr),
            stack: msgErr?.stack,
          });
        }
      }
    } catch (pollErr: any) {
      logger.error("Error in SQS polling loop", {
        error: pollErr?.message ?? String(pollErr),
        stack: pollErr?.stack,
        queueUrl,
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function processS3Record(record: any, messageId?: string) {
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
    const existing = await prisma.metadata.findUnique({
      where: { s3Key },
    });

    if (!existing) {
      logger.warn("No metadata record found for S3 key", { s3Key, messageId });
      return;
    }

    const updated = await prisma.metadata.update({
      where: { s3Key },
      data: {
        status: "complete",
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

async function deleteMessage(receiptHandle: string) {
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

export { pollS3Events };
