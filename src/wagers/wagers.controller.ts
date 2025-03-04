import { Controller } from '@nestjs/common';
import { WagersService } from './wagers.service';

@Controller('wagers')
export class WagersController {
  constructor(private readonly wagersService: WagersService) {};
}
