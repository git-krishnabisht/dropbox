import { Request, Response } from "express";
import prisma from "../../shared/utils/prisma.util";
import logger from "../../shared/utils/logger.util";
import bcrypt from "bcrypt";
import { sts } from "../../shared/types/common.types";
import { validateAuthBody } from "./auth.validation";

export class authController {
  static async sign_up(req: Request, res: Response) {
    try {
      logger.info("Sign up has started", {
        user: req.body.user,
        valid_req: true ? req.body?.user : false,
      });

      const { user } = req.body;

      const user_validate = validateAuthBody(user, sts.SIGNUP);
      if (user_validate.length > 0) {
        logger.info("Missing required fields in SignUp request", {
          fields: user_validate,
        });
        return res.status(400).json({ error: "Missing required fields" });
      }

      logger.info("Checking if User exits in the DB", {
        user: req.body.user.email,
      });
      const user_exits = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true },
      });
      if (!!user_exits) {
        logger.info("User already exists in the DB", {
          user: req.body.user,
        });
        return res.status(400).json({ error: "User already exists in the DB" });
      }

      const salt_rounds = 12;
      const password_hash = await bcrypt.hash(user.password, salt_rounds);

      logger.info("Creating user record in the DB", {
        user: req.body.user.email,
      });
      await prisma.user.create({
        data: {
          email: user.email,
          name: user.name,
          passwordHash: password_hash,
        },
      });
      logger.info("User registered successfully", {
        user: req.body.user.email,
      });
      return res.status(200).json({ status: "User registered successfully" });
    } catch (err) {
      logger.error("Error registering the user", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        user: req.body.user,
      });
      res.status(500).json({ error: "Error registering the user" });
    }
  }

  static async sign_in(req: Request, res: Response) {
    try {
      logger.info("Sign in has started", {
        user: req.body.user,
        valid_req: true ? req.body?.user : false,
      });
      const { user: usr } = req.body;
      const user_validate = validateAuthBody(usr, sts.SIGNIN);
      if (user_validate.length > 0) {
        logger.info("Missing required fields in SignIn request", {
          fields: user_validate,
        });
        return res.status(400).json({ error: "Missing required fields" });
      }

      logger.info("Querying User from the DB", {
        user: req.body.user.email,
      });

      const u = await prisma.user.findUnique({
        where: { email: usr.email },
        select: { id: true, passwordHash: true },
      });

      if (!u) {
        logger.info("Invalid Credentials, User does not exits in the DB", {
          user: req.body.user.email,
        });
        return res.status(400).json({
          error:
            "Invalid Credentials, User does not exits in the DB, You need to SignUp first",
        });
      }

      const is_valid = bcrypt.compare(
        usr.passwordHash,
        u.passwordHash as string
      );

      if (!is_valid) {
        logger.info("Invalid Password", {
          user: req.body.user.email,
        });
        return res.status(400).json({
          error: "Invalid Password",
        });
      }

      logger.info("User logged in successfully", {
        user: req.body.user.email,
      });

      return res.status(200).json({ status: "User logged in successfully" });
    } catch (err) {
      logger.error("Error logging-in the user", {
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        user: req.body.user,
      });
      res.status(500).json({ error: "Error logging-in the user" });
    }
  }
}
