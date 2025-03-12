import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { Admin, User } from '@prisma/client';
import logger from '../logger';
import { Secrets } from '../env';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly context = JwtStrategy.name

  constructor(private prisma: DbService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: Secrets.JWT_SECRET,
    });
  }

  async validate(payload: any): Promise<User | Admin> {
    try {
      // Prompt user to login if token has expired
      const expirationTime = payload.exp * 1000
      const currentTime = new Date().getTime()
      if (currentTime > expirationTime) {
        throw new UnauthorizedException('Session expired. Please log in.')
      }

      if (!payload.admin) {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub }
        });
  
        delete user.password;
        return user;
      }

      const admin = await this.prisma.admin.findUnique({
        where: { id: payload.sub }
      });
      
      delete admin.passcode;
      return admin;
    } catch (error) {
      logger.error(`[${this.context}] An error occurred while validating authorization token. Error: ${error.message}\n`)
    }
  }
}
