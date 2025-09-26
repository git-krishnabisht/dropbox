export interface jwtPayload {
  userId: string;
  email: string;
}

export interface user {
  email: string;
  name: string;
  password: string;
}

export enum sts {
  SIGNIN,
  SIGNUP,
}
