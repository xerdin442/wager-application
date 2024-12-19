import { IsEmail, IsNotEmpty, IsOptional, IsString, IsStrongPassword } from "class-validator";

export class AuthDto {
  @IsEmail({}, { message: 'Please enter a valid email address' })
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
  }, { message: 'Password must contain at least one uppercase letter, one lowercase letter, one digit and one symbol' })
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
  }, { message: 'Password must contain at least one uppercase letter, one lowercase letter, one digit and one symbol' })
  newPassword: string;
}