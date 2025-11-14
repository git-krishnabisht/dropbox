import bcrypt from "bcrypt";

export class AuthUtils {
  static async hashPassword(password: string) {
    const salt_rounds = 12;
    const password_hash = await bcrypt.hash(password, salt_rounds);
    return password_hash;
  }

  static async hashCompare(raw: string, hashed: string) {
    const res = await bcrypt.compare(raw, hashed);
    return res;
  }
}
