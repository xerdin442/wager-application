import { HttpStatus, Injectable } from '@nestjs/common';
import axios from 'axios';
import { FiatAmountDto } from './dto';
import { AccountDetails, BankData } from './types';
import { RpcException } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { UtilsService } from '@app/utils';
import { TransactionStatus, TransactionType, User } from '@prisma/client';
import { DbService } from '@app/db';

@Injectable()
export class FiatService {
  private readonly context: string = FiatService.name;

  private authorizationHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY as string}`,
  };
  private readonly ITEMS_PER_PAGE: number = 60;

  constructor(
    private readonly config: ConfigService,
    private readonly utils: UtilsService,
    private readonly prisma: DbService,
  ) {}

  async getBankNames(): Promise<string[]> {
    try {
      const url = `https://api.paystack.co/bank?country=nigeria&perPage=${this.ITEMS_PER_PAGE}`;
      const response = await axios.get(url);
      const banks = response.data.data as BankData[];

      return banks.map((bank) => bank.name);
    } catch (error) {
      throw error;
    }
  }

  async getBankCode(bankName: string): Promise<string> {
    try {
      const url = `https://api.paystack.co/bank?country=nigeria&perPage=${this.ITEMS_PER_PAGE}`;
      const response = await axios.get(url);
      const banks = response.data.data as BankData[];
      const recipientBank = banks.find((bank) => bank.name === bankName);

      if (!recipientBank) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Bank not found. Kindly input the correct bank name',
        });
      }

      return recipientBank.code;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while retrieving bank code. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  async verifyAccountDetails(details: AccountDetails): Promise<void> {
    try {
      const bankCode = await this.getBankCode(details.bankName);

      // Check if the account details match and return an error message if there is a mismatch
      const url = `https://api.paystack.co/bank/resolve?account_number=${details.accountNumber}&bank_code=${bankCode}`;
      const verification = await axios.get(url, {
        headers: this.authorizationHeaders,
      });

      if (
        verification.status !== 200 ||
        verification.data.data.account_name !==
          details.accountName.toUpperCase()
      ) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message:
            'Please check the spelling or order of your account name. The names should be ordered as it was during your account opening at the bank',
        });
      }

      return;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while verifying account details. Error: ${error.message}\n`,
        );

      if (axios.isAxiosError(error)) {
        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message:
            'Failed to verify account details. Please check your account number and try again',
        });
      }

      throw error;
    }
  }

  async createTransferRecipient(details: AccountDetails): Promise<string> {
    try {
      const bankCode = await this.getBankCode(details.bankName);

      const url = 'https://api.paystack.co/transferrecipient';
      const response = await axios.post(
        url,
        {
          type: 'nuban',
          bank_code: bankCode,
          name: details.accountName,
          account_number: details.accountNumber,
          currency: 'NGN',
        },
        {
          headers: this.authorizationHeaders,
        },
      );

      return response.data.data.recipient_code as string;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while creating transfer recipient. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  async deleteTransferRecipient(recipientCode: string): Promise<void> {
    try {
      const url = `https://api.paystack.co/transferrecipient/${recipientCode}`;
      await axios.delete(url, {
        headers: this.authorizationHeaders,
      });
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while deleting transfer recipient. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  async initiateTransfer(
    details: AccountDetails,
    amount: number,
    metadata: Record<string, any>,
  ): Promise<string> {
    const recipient = await this.createTransferRecipient(details);
    try {
      const url = 'https://api.paystack.co/transfer';
      const response = await axios.post(
        url,
        {
          amount,
          reason: 'Funds Withdrawal',
          source: 'balance',
          recipient,
          currency: 'NGN',
          metadata,
        },
        {
          headers: this.authorizationHeaders,
        },
      );

      return response.data.data.transfer_code as string;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while initiating transfer from balance. Error: ${error.message}\n`,
        );

      throw error;
    } finally {
      await this.deleteTransferRecipient(recipient);
    }
  }

  async initializeTransaction(
    email: string,
    amount: number,
    metadata: Record<string, any>,
  ): Promise<string> {
    try {
      const url = 'https://api.paystack.co/transaction/initialize';
      const response = await axios.post(
        url,
        { amount, email, metadata },
        {
          headers: this.authorizationHeaders,
        },
      );

      return response.data.data.authorization_url as string;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while initializing transaction. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  async fiatConversion(
    dto: FiatAmountDto,
    targetCurrency: string,
  ): Promise<number> {
    try {
      const response = await axios.get(
        `https://v6.exchangerate-api.com/v6/${this.config.getOrThrow<string>('EXCHANGE_RATE_API_KEY')}/pair/USD/NGN`,
      );
      const conversionRate = response.data.conversion_rate as number;

      let amount: string = '';
      switch (targetCurrency) {
        case 'NGN':
          return dto.amount * (conversionRate - 75);

        case 'USD':
          amount = (dto.amount / (conversionRate + 100)).toFixed(2);
          return parseFloat(amount);

        default:
          throw new RpcException({
            status: HttpStatus.BAD_REQUEST,
            message:
              'Invalid currency code provided in query parameter. Expected "USD" or "NGN"',
          });
      }
    } catch (error) {
      throw error;
    }
  }

  async updateDbAfterTransaction(
    userId: number,
    amount: number,
    status: TransactionStatus,
    type: TransactionType,
  ): Promise<User> {
    try {
      let user: User | undefined;

      // Update user balance
      if (status === 'SUCCESS') {
        if (type === 'WITHDRAWAL') {
          user = await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { decrement: amount } },
          });
        } else {
          user = await this.prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: amount } },
          });
        }
      }

      // Store transaction details
      await this.prisma.transaction.create({
        data: {
          amount: amount,
          method: 'FIAT',
          type,
          status,
          userId,
        },
      });

      return user as User;
    } catch (error) {
      throw error;
    }
  }
}
