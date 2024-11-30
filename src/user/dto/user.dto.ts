import { IsEmail, IsOptional, IsString } from "class-validator";

export class updateProfileDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string

  @IsOptional()
  @IsString()
  lastName?: string

  @IsOptional()
  @IsString()
  profileImage?: string
}