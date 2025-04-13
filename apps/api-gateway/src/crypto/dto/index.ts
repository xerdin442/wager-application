import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CryptoWithdrawalDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  address: string;
}
