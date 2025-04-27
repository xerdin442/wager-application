export type SessionData = {
  email?: string;
  otp?: string;
  otpExpiration?: number;
};

export type CreateWalletResponse = {
  address: string;
  privateKey: string;
};

export type GoogleAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
};
