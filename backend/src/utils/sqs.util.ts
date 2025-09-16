import { SQSClient } from "@aws-sdk/client-sqs";
import { config } from "../config/env.config.js";

export const sqs = new SQSClient({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});
