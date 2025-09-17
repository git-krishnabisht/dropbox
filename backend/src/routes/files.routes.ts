import { Router } from "express";
import { fileController } from "../controllers/files.controller.js";
// import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// router.use(authenticateToken);

router.post("/upload-url", fileController.getSignedUploadUrl);
router.post("/download-url", fileController.getSignedDownloadUrl);

export { router as file_router };
