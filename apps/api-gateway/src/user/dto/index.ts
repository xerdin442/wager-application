import {
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProfileDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsString()
  twoFASecret?: string;

  @IsOptional()
  @IsBoolean()
  twoFAEnabled?: boolean;
}

export class GetTransactionsDto {
  @IsEnum(TransactionStatus, {
    message: 'Invalid "status" value. Expected "SUCCESS" or "FAILED"',
  })
  @IsOptional()
  status?: TransactionStatus;

  @IsEnum(TransactionType, {
    message: 'Invalid "type" value. Expected "DEPOSIT" or "WITHDRAWAL"',
  })
  @IsOptional()
  type?: TransactionType;

  @IsEnum(TransactionMethod, {
    message: 'Invalid "method" value. Expected "FIAT" or "CRYPTO"',
  })
  @IsOptional()
  method?: TransactionMethod;
}

export class FundsTransferDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsNumber()
  @IsNotEmpty()
  amount: number;
}
