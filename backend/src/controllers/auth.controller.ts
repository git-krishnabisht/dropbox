import { Request, Response } from "express";
import { users } from "../types/user.type";
import { jwtService } from "../services/jwt.service";

export class authController {
  static async sign_up(req: Request, res: Response) {
    const user_data: users = req.body;
    const token = await jwtService.assign({ userId: user_data.userId, email: user_data.email })
    return res.send({ data: "Authenticaion..", user: user_data, token: token });
  }
}



