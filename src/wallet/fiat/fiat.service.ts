import { BadRequestException, Injectable } from '@nestjs/common';
import { Secrets } from '@src/common/env';
import logger from '@src/common/logger';
import { BankData, AccountDetails } from '@src/common/types';
import axios from 'axios';
import { NairaConversionDto } from './dto';

@Injectable()
export class FiatService {
  private readonly context: string = FiatService.name;

  async getBankNames(): Promise<string[]> {
    try {
      const banksPerPage: number = 60;
      const url = `https://api.paystack.co/bank?country=nigeria&perPage=${banksPerPage}`
      const response = await axios.get(url);
      const banks: BankData[] = response.data.data;

      return banks.map(bank => bank.name);
    } catch (error) {
      throw error;
    }
  }
  
  async getBankCode(bankName: string): Promise<string> {
    try {
      const banksPerPage: number = 60;
      const url = `https://api.paystack.co/bank?country=nigeria&perPage=${banksPerPage}`;
      const response = await axios.get(url);
      const banks: BankData[] = response.data.data;
      const recipientBank = banks.find(bank => bank.name === bankName);

      if (!recipientBank) {
        throw new BadRequestException('Bank not found. Kindly input the correct bank name')
      };

      return recipientBank.code;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while retrieving bank code. Error: ${error.message}\n`);
      throw error;
    }
  }

  async verifyAccountDetails(details: AccountDetails): Promise<void> {
    try {
      const bankCode = await this.getBankCode(details.bankName);

      // Check if the account details match and return an error message if there is a mismatch
      const url = `https://api.paystack.co/bank/resolve?account_number=${details.accountNumber}&bank_code=${bankCode}`;
      const verification = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${Secrets.PAYSTACK_SECRET_KEY}` }
      });

      if (verification.status !== 200 || verification.data.data.account_name !== details.accountName.toUpperCase()) {
        throw new BadRequestException('Please check the spelling or order of your account name. The names should be ordered as it was during your account opening at the bank')
      };

      return;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while verifying account details. Error: ${error.message}\n`);

      if (axios.isAxiosError(error)) {
        throw new BadRequestException('Failed to verify account details. Please check your account number and try again')
      };

      throw error;
    }
  }

  async createTransferRecipient(details: AccountDetails): Promise<string> {
    try {
      const bankCode = await this.getBankCode(details.bankName)

      const url = 'https://api.paystack.co/transferrecipient';
      const response = await axios.post(url,
        {
          "type": "nuban",
          "bank_code": bankCode,
          "name": details.accountName,
          "account_number": details.accountNumber,
          "currency": "NGN"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Secrets.PAYSTACK_SECRET_KEY}`
          }
        }
      );

      return response.data.data.recipient_code;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while creating transfer recipient. Error: ${error.message}\n`);
      throw error;
    }
  }

  async deleteTransferRecipient(recipientCode: string): Promise<void> {
    try {
      const url = `https://api.paystack.co/transferrecipient/${recipientCode}`
      await axios.delete(url,
        { headers: { 'Authorization': `Bearer ${Secrets.PAYSTACK_SECRET_KEY}` } }
      );
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while deleting transfer recipient. Error: ${error.message}\n`);
      throw error;
    }
  }

  async initiateTransfer(details: AccountDetails, amount: number, metadata: Record<string, any>)
    : Promise<string> {
    const recipient = await this.createTransferRecipient(details);
    try {
      const url = 'https://api.paystack.co/transfer'
      const response = await axios.post(url,
        {
          amount,
          reason: "Funds Withdrawal",
          source: "balance",
          recipient,
          currency: "NGN",
          metadata
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Secrets.PAYSTACK_SECRET_KEY}`
          }
        }
      )

      return response.data.data.transfer_code;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while initiating transfer from balance. Error: ${error.message}\n`);
      throw error;
    } finally {
      await this.deleteTransferRecipient(recipient);
    }
  }

  async initializeTransaction(email: string, amount: number, metadata: Record<string, any>)
    : Promise<string> {
    try {
      const url = 'https://api.paystack.co/transaction/initialize'
      const response = await axios.post(url,
        { amount, email, metadata },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Secrets.PAYSTACK_SECRET_KEY}`
          }
        }
      )

      return response.data.data.authorization_url
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while initializing transaction. Error: ${error.message}\n`);
      throw error;
    }
  }

  async convertToNaira(dto: NairaConversionDto): Promise<number> {
    try {
      return;
    } catch (error) {
      throw error;
    }
  }
}
