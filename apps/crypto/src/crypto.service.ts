import { Injectable } from '@nestjs/common';

@Injectable()
export class CryptoService {
  getHello(): string {
    return 'Hello World!';
  }
}
