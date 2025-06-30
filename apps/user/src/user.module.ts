import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { DbModule } from '@app/db';
import { UtilsModule } from '@app/utils';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DbModule,
    UtilsModule,
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
