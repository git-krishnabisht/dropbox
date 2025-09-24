## Designing dropbox clone

A Node.js backend service that provides secure file upload and download functionality using AWS S3, with real-time processing notifications via SQS.

## Architecture Overview

![Workflow Diagram](/backend/assets/api-workflow.png)

## Workflow

- POST /api/files/upload-url body:{ filename, mimeType } -> return 200 & { uploadUrl, fileId } -> (execution) -> DB stores the metadata { fileId, fileName, mimeType, s3Key, status="pending" } and s3 generates a PUT presigned url (15min expiry) for uploading the file blob straight to s3.

- PUT /s3-presigned-url { fileBlob } -> returns 200 -> (execution) -> file gets uploaded to s3, s3 pushes an ObjectCreated:Put message to sqs -> background worker polls sqs every 20 seconds, reads that event and updates the metadata { ..., status="complete", size } in DB.

- POST /api/files/download-url body:{ s3Key } -> returns 200 & { downloadUrl } -> (execution) -> s3 generates a GET presigned url (15min expiry) for downloading the file blob directly from s3.
