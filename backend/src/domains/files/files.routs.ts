import { Router } from "express";
import { fileController } from "./files.controller";
import { authenticateToken } from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(authenticateToken);

router.post("/upload-url", fileController.getSignedUploadUrl);
router.post("/download-url", fileController.getSignedDownloadUrl);

export { router as file_router };
