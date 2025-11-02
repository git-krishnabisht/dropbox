import { Router } from "express";
import { fileController } from "./files.controller";
// import { authenticateToken } from "../../shared/middleware/auth.middleware";

const router = Router();

// router.use(authenticateToken);

router.post("/get-urls", fileController.getUrls);
router.post("/complete-upload", fileController.completeUpload);
router.post("/record-chunk", fileController.recordChunkUpload);

export { router as file_router };
