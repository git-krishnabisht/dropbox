import { Router } from "express";
import { fileController } from "./files.controller";
import { authenticateToken } from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.post("/upload-init", fileController.uploadInit);
router.post("/presigned-urls", fileController.getPresignedUrls);
router.post("/complete-upload", fileController.completeUpload);

// router.post("/upload-url", fileController.getSignedUploadUrl);
// router.post("/download-url", fileController.getSignedDownloadUrl);

export { router as file_router };
