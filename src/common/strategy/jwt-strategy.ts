import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../../db/db.service';
import { User } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: DbService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: any): Promise<User> {
    // Prompt user to login if token has expired
    const expirationTime = payload.exp * 1000
    const currentTime = new Date().getTime()
    if (currentTime > expirationTime) {
      throw new UnauthorizedException('Session expired. Please log in.')
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    })

    delete user.password;
    return user;
  }
}
