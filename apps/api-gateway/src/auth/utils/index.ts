export const selectGoogleCallbackUrl = (): string => {
  const NODE_ENV = process.env.NODE_ENV as string;

  if (NODE_ENV === 'development' || NODE_ENV === 'test') {
    return 'http://localhost:3000/api/auth/google/callback';
  }

  return process.env.GOOGLE_CALLBACK_URL as string;
};
