import {
  IsNotEmpty,
  IsNumber,
  IsString
} from "class-validator";

export class FiatAmountInputDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;
}

export class FiatWithdrawalDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  bankName: string;
}