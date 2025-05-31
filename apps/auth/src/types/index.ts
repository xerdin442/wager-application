export type SessionData = {
  email?: string;
  otp?: string;
  otpExpiration?: number;
};

export type GoogleAuthPayload = {
  email: string;
  firstName: string;
  lastName: string;
  profileImage?: string;
};
