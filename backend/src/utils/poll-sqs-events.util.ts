import {
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import prisma from "./prisma.util.js";
import { sqs } from "./sqs.util.js";
import { config } from "../config/env.config.js";
import logger from "./logger.js";

const queueUrl = config.aws.sqs;

if (!queueUrl) {
  logger.error("SQS_QUEUE_URL is not configured. SQS polling disabled.");
}

function tryParseJson<T = any>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractS3Records(messageBody: any): any[] {
  if (Array.isArray(messageBody?.Records)) return messageBody.Records;

  if (
    messageBody?.Type === "Notification" &&
    typeof messageBody?.Message === "string"
  ) {
    const inner = tryParseJson(messageBody.Message);
    if (Array.isArray(inner?.Records)) return inner.Records as any[];
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
    return decodeURIComponent(plusNormalized);
  } catch {
    return rawKey;
  }
}

async function pollS3Events() {
  if (!queueUrl) {
    logger.warn("SQS polling disabled - no queue URL configured");
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

      if (!Messages || Messages.length === 0) continue;

      logger.info("Received SQS messages", { count: Messages.length });

      for (const msg of Messages) {
        logger.info("Processing SQS message", { messageId: msg.MessageId });

        try {
          const parsedBody = tryParseJson<any>(msg.Body!);
          if (!parsedBody) {
            logger.warn("Failed to parse SQS message body", {
              messageId: msg.MessageId,
            });
            continue;
          }

          const records = extractS3Records(parsedBody);
          if (!records || records.length === 0) {
            logger.warn("SQS message missing Records array. Skipping.", {
              messageId: msg.MessageId,
              body: JSON.stringify(parsedBody, null, 2),
            });
            await sqs.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: msg.ReceiptHandle!,
              })
            );
            continue;
          }

          for (const record of records) {
            const rawKey: string | undefined = record?.s3?.object?.key;
            if (!rawKey) {
              logger.warn("Record missing S3 object key", { record });
              continue;
            }

            const s3Key = decodeS3Key(rawKey);
            const size = record?.s3?.object?.size;

            try {
              const updated = await prisma.metadata.update({
                where: { s3Key },
                data: {
                  status: "complete",
                  ...(size && { size: parseInt(size) }),
                },
              });

              logger.info("Updated metadata status to complete", {
                s3Key,
                fileId: updated.fileId,
                size: updated.size,
              });
            } catch (dbErr: any) {
              logger.error("Failed to update metadata for S3 key", {
                s3Key,
                error: dbErr?.message ?? String(dbErr),
                code: dbErr?.code,
              });
            }
          }

          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: msg.ReceiptHandle!,
            })
          );
        } catch (msgErr: any) {
          logger.error("Error processing SQS message", {
            messageId: msg.MessageId,
            error: msgErr?.message ?? String(msgErr),
          });
        }
      }
    } catch (pollErr: any) {
      logger.error("Error in SQS polling loop", {
        error: pollErr?.message ?? String(pollErr),
      });
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

export { pollS3Events };
