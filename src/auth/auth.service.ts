import { ForbiddenException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as argon from 'argon2'
import { AuthDto } from './dto/auth.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: DbService,
    private jwt: JwtService,
    private config: ConfigService
  ) {}

  async signup(dto: AuthDto): Promise<User> {
    try {
      const hash = await argon.hash(dto.password)
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hash,
          profileImage: '',
          firstName: dto.firstName || null,
          lastName: dto.lastName || null
        }
      })
  
      delete user.password;
      return user;
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ForbiddenException(`This ${error.meta.target[0]} already exists. Please try again!`)
        }
      }

      throw error;
    }
  }

  async login(dto: AuthDto): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          email: dto.email
        }
      })
      if (!user) {
        throw new ForbiddenException('Invalid email address')
      }
  
      const checkPassword = await argon.verify(user.password, dto.password)
      if (!checkPassword) {
        throw new ForbiddenException('Invalid password')
      }
      
      const payload = { sub: user.id, email: user.email }
      const options = { expiresIn: '1h', secret: this.config.get<string>('JWT_SECRET') }
      
      return this.jwt.signAsync(payload, options);
    } catch (error) {
      throw error;
    }
  }
}