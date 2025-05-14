import { User } from '@prisma/client';

export type SocialAuthUser = {
  user?: User;
  token: string;
  twoFactorAuth?: boolean;
};

export type SocialAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  username?: string;
};

export type SocialAuthCallbackData = {
  user?: User;
  token: string;
  redirectUrl: string;
  nonce: string;
  twoFactorAuth?: boolean;
};
