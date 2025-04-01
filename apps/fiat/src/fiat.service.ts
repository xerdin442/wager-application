import { Injectable } from '@nestjs/common';

@Injectable()
export class FiatService {
  getHello(): string {
    return 'Hello World!';
  }
}
