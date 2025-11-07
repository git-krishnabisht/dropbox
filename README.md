# Dropfile: A Secure Cloud Storage

A file storage service implementing multipart upload with AWS S3, real-time processing via SQS, and PostgreSQL metadata management.

![Workflow Diagram](/backend/assets/api-workflow.png)

## Architecture

### Upload Flow
1. Client requests presigned URLs for multipart upload
2. File is split into 5MB chunks and uploaded directly to S3
3. Each chunk completion is recorded in PostgreSQL
4. After all chunks complete, multipart upload is finalized
5. S3 triggers ObjectCreated event to SQS
6. Background worker polls SQS and updates file status to UPLOADED

### Technology Stack

**Backend**
- Node.js with Express
- TypeScript
- Prisma ORM with PostgreSQL
- AWS SDK v3 (S3, SQS)
- Redis for upload session management
- JWT authentication with RS256

**Frontend**
- TypeScript
- Vite build tool
- Native fetch API for uploads

**Infrastructure**
- AWS S3 for object storage
- AWS SQS for event processing
- PostgreSQL for metadata
- Redis for caching

## Database Schema

```sql
User {
  id, email, name, passwordHash, createdAt
}

FileMetadata {
  fileId, fileName, mimeType, size, s3Key, status, userId, createdAt
  status: UPLOADING | UPLOADED | FAILED
}

Chunk {
  id, fileId, chunkIndex, size, s3Key, checksum, status, createdAt
  status: PENDING | COMPLETED | FAILED
}
```

## Setup

### Prerequisites
- Node.js >= 18
- PostgreSQL database
- Redis instance
- AWS account with S3 and SQS configured

### Environment Variables

Create `backend/.env`:

```env
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
S3_BUCKET=your_bucket_name
SQS_QUEUE_URL=your_sqs_queue_url

# Database
CLOUD_DB_URI=postgresql://user:password@host:port/database

# Redis
CLOUD_RD_URI=redis://host:port

# JWT Keys (RS256)
PRIVATE_KEY=your_private_key
PUBLIC_KEY=your_public_key

# Optional: OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### Installation

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login

### File Operations
- `POST /api/files/get-upload-urls` - Initialize multipart upload
- `POST /api/files/record-chunk` - Record chunk metadata
- `POST /api/files/complete-upload` - Finalize multipart upload
- `POST /api/files/get-download-url` - Generate download URL

## Features

- Chunked file upload (5MB chunks, max 1GB files)
- Direct-to-S3 uploads using presigned URLs
- Automatic retry logic with exponential backoff
- Upload cancellation support
- Redis-based upload session management (24hr TTL)
- Background SQS polling for S3 events
- JWT-based authentication with HTTP-only cookies
- Comprehensive error handling and logging

## Configuration

- Chunk size: 5MB
- Max file size: 1GB
- Presigned URL expiry: 1 hour
- JWT token expiry: 15 minutes
- Redis TTL: 24 hours
- SQS polling interval: 20 seconds

## Development

```bash
# Backend
npm run dev      # Start dev server with hot reload
npm run build    # Compile TypeScript
npm start        # Run production build

# Frontend
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
```

## Security Notes

- All passwords are hashed using bcrypt (12 rounds)
- JWT tokens use RS256 asymmetric encryption
- Cookies are HTTP-only with secure flag in production
- S3 uploads use time-limited presigned URLs
- Database queries use Prisma's parameterized statements

## Limitations

- Single file upload only (no concurrent uploads)
- Maximum file size: 1GB
- Chunk size fixed at 5MB
- No resumable uploads on session loss
- Upload metadata cleanup requires manual intervention on failure
