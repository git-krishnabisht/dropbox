import { Router } from "express";
import { authController } from "./auth.controller";

const router = Router();

router.post("/signup", authController.sign_up);
router.post("/signin", authController.sign_in);

export { router as auth_router };
