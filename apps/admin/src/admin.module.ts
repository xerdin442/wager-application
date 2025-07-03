import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from '@app/db';
import { UtilsModule } from '@app/utils';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DbModule,
    UtilsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
