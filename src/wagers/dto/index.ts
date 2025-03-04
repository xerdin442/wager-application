import { WagerCategory } from "@prisma/client";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateWagerDto {
  @IsString()
  @IsNotEmpty()
  title: string

  @IsString()
  @IsNotEmpty()
  conditions: string

  @IsString()
  @IsNotEmpty()
  category: WagerCategory

  @IsNumber()
  @IsNotEmpty()
  stake: number
}