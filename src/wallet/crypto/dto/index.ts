import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CryptoDepositDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;
}

export class CryptoWithdrawalDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;
  
  @IsString()
  @IsNotEmpty()
  address: string;
}