import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class FiatAmountDTO {
  @IsNumber()
  @IsNotEmpty()
  amount: number;
}

export class FiatWithdrawalDTO {
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
