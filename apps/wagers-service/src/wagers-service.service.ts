import { Injectable } from '@nestjs/common';

@Injectable()
export class WagersServiceService {
  getHello(): string {
    return 'Hello World!';
  }
}
