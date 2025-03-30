import { Injectable } from '@nestjs/common';

@Injectable()
export class CryptoServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
