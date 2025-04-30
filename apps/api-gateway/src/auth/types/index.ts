import { User } from '@prisma/client';

export type GoogleAuthUser = {
  user: User;
  token: string;
};

export type GoogleAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
};

export type GoogleAuthCallbackData = {
  user: any;
  token: string;
  redirectUrl: string;
  nonce: string;
};
