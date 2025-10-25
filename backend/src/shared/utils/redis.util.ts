import Redis from "ioredis";
import { config } from "../config/env.config.js";

export const rd = new Redis(config.redis.rdURI);
