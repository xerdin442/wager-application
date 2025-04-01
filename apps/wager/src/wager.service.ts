import { Injectable } from '@nestjs/common';

@Injectable()
export class WagerService {
  getHello(): string {
    return 'Hello World!';
  }
}
