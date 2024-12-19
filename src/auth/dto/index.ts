import { IsEmail, IsNotEmpty, IsOptional, IsString, IsStrongPassword } from "class-validator";

export class AuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  })
  password: string

  @IsOptional()
  @IsString()
  firstName?: string

  @IsOptional()
  @IsString()
  lastName?: string
}

export class Verify2FADto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class PasswordResetDto {
  @IsString()
  @IsNotEmpty()
  email: string;
}

export class VerifyOTPDto {
  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class NewPasswordDto {
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({
    minLength: 8,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
    minSymbols: 1
  })
  newPassword: string;
}