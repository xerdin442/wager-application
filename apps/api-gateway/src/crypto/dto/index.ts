import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CryptoWithdrawalDTO {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  address: string;
}
