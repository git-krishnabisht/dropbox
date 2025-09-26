import { Request, Response, NextFunction } from "express";
import { jwtService } from "../services/jwt.service.js";
import logger from "../utils/logger.util.js";

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.authToken;

    if (!token) {
      logger.warn("Authentication failed: No token provided", {
        url: req.url,
        method: req.method,
      });
      return res.status(401).json({ error: "Access token required" });
    }

    const decoded = (await jwtService.verify(token)) as {
      userId: number;
      email: string;
    };
    req.user = decoded;

    logger.info("User authenticated successfully", {
      userId: decoded.userId,
      email: decoded.email,
    });
    next();
  } catch (error) {
    logger.error("Authentication failed: Invalid token", {
      error: error instanceof Error ? error.message : error,
      url: req.url,
      method: req.method,
    });
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};
