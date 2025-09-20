import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.util.js";
import {
  sqs,
  testQueueAccess,
  extractS3Records,
  tryParseJson,
  deleteMessage,
  processS3Record,
} from "../utils/sqs.util.js";

const queueUrl = config.aws.sqs;

// 1 - polls for any sqs event, ex: ObjectCreated:Put
async function pollS3Events() {
  if (!queueUrl) {
    logger.error("SQS_QUEUE_URL is not configured. SQS polling disabled.");
    return;
  }

  // 2 - Checks if the server is authorized to access SQS
  const hasAccess = await testQueueAccess();
  if (!hasAccess) {
    logger.error(
      "Cannot access SQS queue. Check your credentials, queue URL, and IAM permissions."
    );
    return;
  }

  logger.info("Starting SQS polling for S3 events", { queueUrl });

  // 3 - continuously polls for any messages from SQS
  while (true) {
    try {
      // SQS operation
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl, // Env
        MaxNumberOfMessages: 5, // Ask for 5 messages from SQS in one call
        WaitTimeSeconds: 20, // Poll every 20 second
      });

      // 4 - Sends the request to SQS and recieves a json response
      const { Messages } = await sqs.send(command);

      if (!Messages || Messages.length === 0) {
        logger.debug("No messages received from SQS");
        continue;
      }

      logger.info("Received SQS messages", { count: Messages.length });

      // 5 - Message processing happens
      for (const msg of Messages) {
        logger.info("Processing SQS message", {
          messageId: msg.MessageId,
          body: tryParseJson(msg.Body),
        });

        try {
          // 6 - De-serializes the JSON body
          const parsedBody = tryParseJson<any>(msg.Body!);

          if (!parsedBody) {
            logger.warn("Failed to parse SQS message body", {
              messageId: msg.MessageId,
              rawBody: msg.Body,
            });

            // if De-serialization fails, then delete that(failed) message from the SQS
            await deleteMessage(msg.ReceiptHandle!);
            continue;
          }

          // 7 - Extract Records: [] from the message
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

            // if no Records: [] found, then delete that message from the SQS
            await deleteMessage(msg.ReceiptHandle!);
            continue;
          }

          logger.info("Found S3 records in message", {
            messageId: msg.MessageId,
            recordCount: records.length,
          });

          for (const record of records) {
            // Process Records: []
            await processS3Record(record, msg.MessageId);
          }

          // Pop from the queue
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

export { pollS3Events };
