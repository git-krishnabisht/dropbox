import { Request, Response } from "express";
import prisma from "../../shared/config/prisma.config";
import logger from "../../shared/utils/logger.util";
import { sts } from "../../types/common.types";
import { jwtService } from "../../shared/services/jwt.service";
import { AuthUtils } from "../../shared/utils/auth.util";
import { ValidationUtil } from "../../shared/utils/validate.util";

export class authController {
  static async sign_up(req: Request, res: Response) {
    logger.info("Sign up has started", {
      user: req.body.user,
    });

    const { user } = req.body;

    const user_validate = ValidationUtil.validateAuthBody(user, sts.SIGNUP);
    if (user_validate.length > 0) {
      logger.info("Missing required fields in SignUp request", {
        fields: user_validate,
      });
      return res
        .status(400)
        .json({ error: `Missing required fields: ${user_validate}` });
    }

    logger.info("Checking if User exits in the DB", {
      user: req.body.user.email,
    });

    const user_exits = await prisma.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    if (user_exits) {
      logger.info("User already exists in the DB", {
        user: req.body.user,
      });
      return res.status(409).json({ error: "User already exists in the DB" }); // 409 - conflit
    }

    const hash = await AuthUtils.hashPassword(user.password);

    logger.info("Creating user record in the DB", {
      user: req.body.user.email,
    });

    await prisma.user.create({
      data: {
        email: user.email,
        name: user.name,
        passwordHash: hash,
      },
    });

    const token = await jwtService.assign({
      email: user.email,
      name: user.name,
    });

    if (!token) {
      logger.error("Missing JWT token");
      return res.status(401).json({
        error: "Missing JWT token",
      });
    }

    logger.info("User registered successfully", {
      user: req.body.user.email,
    });

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({ status: "User has registered successfully" });
  }

  static async sign_in(req: Request, res: Response) {
    logger.info("Sign in has started", {
      user: req.body.user,
    });

    const { user } = req.body;

    const user_validate = ValidationUtil.validateAuthBody(user, sts.SIGNIN);
    if (user_validate.length > 0) {
      logger.info("Missing required fields in SignIn request", {
        fields: user_validate,
      });
      return res
        .status(400)
        .json({ error: `Missing required fields: ${user_validate}` });
    }

    logger.info("Querying User from the DB", {
      user: req.body.user.email,
    });

    const u = await prisma.user.findUnique({
      where: { email: user.email },
      select: { passwordHash: true, email: true, name: true },
    });

    if (!u) {
      logger.info("Invalid Credentials, User does not exits in the DB", {
        user: req.body.user.email,
      });
      return res.status(401).json({
        error:
          "Invalid Credentials, User does not exits in the DB, You need to SignUp first",
      });
    }

    const is_valid = await AuthUtils.hashCompare(
      user.password,
      u.passwordHash as string
    );

    if (!is_valid) {
      logger.info("Invalid Password", {
        user: req.body.user.email,
      });
      return res.status(401).json({
        error: "Invalid Password",
      });
    }

    logger.info("Assigning JWT token", {
      user: req.body.user.email,
    });

    const token = await jwtService.assign({
      email: u.email,
      name: u.name as string,
    });

    if (!token) {
      logger.error("Missing JWT token");
      return res.status(401).json({
        error: "Missing JWT token",
      });
    }

    logger.info("User logged in successfully", {
      user: req.body.user.email,
    });

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({ status: "User logged in successfully" });
  }

  static async refresh_token() {}
}
