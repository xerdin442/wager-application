import { Module } from '@nestjs/common';
import { DbService } from './db.service';
import { UtilsModule } from '@app/utils';

@Module({
  imports: [UtilsModule],
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}
