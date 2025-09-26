import jwt from "jsonwebtoken";
import { jwtPayload } from "../types/common.types.js";
import { config } from "../config/env.config.js";
import logger from "../utils/logger.util.js";

export class jwtService {
  static async assign(payload: jwtPayload) {
    try {
      logger.info("Generating JWT token", {
        email: payload.email,
        name: payload.name,
      });

      const token = jwt.sign(payload, config.jwt.privateKey, {
        algorithm: "RS256",
        expiresIn: "15m",
      });

      logger.info("JWT token generated successfully", {
        email: payload.email,
      });
      return token;
    } catch (error) {
      logger.error("Error generating JWT token", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        email: payload.email,
      });
      throw error;
    }
  }

  static async verify(token: string) {
    try {
      logger.info("Verifying JWT token");

      const decoded = jwt.verify(token, config.jwt.publicKey, {
        algorithms: ["RS256"],
      });

      logger.info("JWT token verified successfully", { payload: decoded });
      return decoded;
    } catch (error) {
      logger.error("Error verifying JWT token", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}
