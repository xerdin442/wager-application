import { User } from '@prisma/client';

export type GoogleAuthUser = {
  user?: User;
  token: string;
  twoFactorAuth?: boolean;
};

export type GoogleAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
};

export type GoogleAuthCallbackData = {
  user?: User;
  token: string;
  redirectUrl: string;
  nonce: string;
  twoFactorAuth?: boolean;
};
