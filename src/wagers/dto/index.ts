import { WagerCategory } from "@prisma/client";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

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

export class UpdateWagerDto {
  @IsString()
  @IsOptional()
  title?: string

  @IsString()
  @IsOptional()
  conditions?: string

  @IsNumber()
  @IsOptional()
  stake?: number
}

export class WagerInviteDto {
  @IsString()
  @IsNotEmpty()
  inviteCode: string
}