import { Router } from "express";
import { fileController } from "../controllers/files.controller.js";
// import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// router.use(authenticateToken);

router.post("/upload-url", fileController.getSignedUrl);

export { router as file_router };
