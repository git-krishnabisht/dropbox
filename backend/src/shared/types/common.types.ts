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

export interface UploadResult {
  ETag: string;
  PartNumber: number;
}

export type InitUploadResult =
  | { success: true; uploadId: string }
  | { success: false; uploadId?: undefined };

export type GetPSURLResult =
  | { success: true; psurl: string }
  | { success: false; psurl?: undefined };
