import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { DbService } from '@app/db';
import { UtilsService } from '@app/utils';
import { RpcException } from '@nestjs/microservices';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly context = JwtStrategy.name;

  constructor(
    private readonly prisma: DbService,
    private readonly utils: UtilsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: Record<string, any>): Promise<User | undefined> {
    try {
      // Prompt user to login if token has expired
      const expirationTime = payload.exp * 1000;
      const currentTime = new Date().getTime();
      if (currentTime > expirationTime) {
        throw new RpcException({
          status: 401,
          message: 'Session expired. Please log in.',
        });
      }

      const user = (await this.prisma.user.findUnique({
        where: { id: payload.sub as number },
      })) as User;

      user.password = '';
      user.ethPrivateKey = '';
      user.solPrivateKey = '';

      return user;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while validating authorization token. Error: ${error.message}\n`,
        );
    }
  }
}
