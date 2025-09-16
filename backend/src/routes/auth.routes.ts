import { Router } from "express";
import { authController } from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", authController.sign_up);

export { router as auth_router };
