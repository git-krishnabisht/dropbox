export interface jwtPayload {
  email: string;
  name: string;
}

export interface user {
  email: string;
  name?: string;
  password: string;
}

export enum sts {
  SIGNIN,
  SIGNUP,
}
