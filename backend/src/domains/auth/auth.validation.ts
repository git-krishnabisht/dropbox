import { user } from "../../shared/types/common.types";
import logger from "../../shared/utils/logger.util";
import { sts } from "../../shared/types/common.types";

export function validateAuthBody(user: user, mode: sts) {
  logger.info("Validating SignUp body", {
    user: user,
    valid_req: true ? user : false,
  });
  const missing: string[] = [];

  if (!user.email || user.email.trim() === "") {
    missing.push("email");
  }

  if (mode === sts.SIGNUP) {
    if (!user.name || user.name.trim() === "") {
      missing.push("name");
    }
  }

  if (!user.password || user.password.trim() === "") {
    missing.push("password");
  }

  return missing.join(", ");
}
