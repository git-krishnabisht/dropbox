import { Router } from "express";
import { authController } from "./auth.controller";

const router = Router();

router.post("/signup", authController.sign_up);

export { router as auth_router };
