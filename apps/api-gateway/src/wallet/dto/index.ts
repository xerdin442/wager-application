import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class WithdrawalDTO {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  address: string;
}
