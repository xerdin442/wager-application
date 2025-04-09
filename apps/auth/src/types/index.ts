export type SessionData = {
  email?: string;
  otp?: string;
  otpExpiration?: number;
};

export type CreateWalletResponse = {
  address: string;
  privateKey: string;
};
