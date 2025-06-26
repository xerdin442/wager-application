import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { DbService } from '@app/db';
import { UtilsService } from '@app/utils';

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
      if (payload.exp > payload.iat) {
        throw new UnauthorizedException('Session expired. Please log in.');
      }

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: payload.sub as number },
      });
      user.password = '';

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
