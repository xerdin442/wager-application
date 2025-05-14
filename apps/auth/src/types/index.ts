export type SessionData = {
  email?: string;
  otp?: string;
  otpExpiration?: number;
};

export type CreateWalletResponse = {
  address: string;
  privateKey: string;
};

export type SocialAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
  username?: string;
};
