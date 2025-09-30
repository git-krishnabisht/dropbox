import { Router } from "express";
import { fileController } from "./files.controller";
// import { authenticateToken } from "../../shared/middleware/auth.middleware";

const router = Router();

// router.use(authenticateToken);

router.post("/upload-init", fileController.uploadInit);
router.post("/presigned-urls", fileController.getPresignedUrls);
router.post("/complete-upload", fileController.completeUpload);
router.post("/record-chunk", fileController.recordChunkUpload);

export { router as file_router };
