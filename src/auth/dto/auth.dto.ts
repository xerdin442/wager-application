import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
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