import { WagerCategory } from "@prisma/client";
import {
  IsEmail,
  IsNotEmpty,
  IsString
} from "class-validator";

export class AdminAuthDto {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  passcode: string;
}

export class CreateAdminDto {
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  category: WagerCategory;
}