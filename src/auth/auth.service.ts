import { BadRequestException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import * as argon from 'argon2'
import { AuthDto, Verify2FADto } from './dto/auth.dto';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import * as speakeasy from 'speakeasy';
import * as qrCode from 'qrcode';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: DbService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async signup(dto: AuthDto, filePath: string | undefined)
  : Promise<{ user: User, token: string }> {
    try {
      const hash = await argon.hash(dto.password)
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hash,
          profileImage: filePath || this.config.get<string>('DEFAULT_IMAGE'),
          firstName: dto.firstName || null,
          lastName: dto.lastName || null
        }
      });

      const payload = { sub: user.id, email: user.email }
      const options = { expiresIn: '1h', secret: this.config.get<string>('JWT_SECRET') };
      const token = await this.jwt.signAsync(payload, options);

      return { user, token }
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new BadRequestException(`This ${error.meta.target[0]} already exists. Please try again!`)
        }
      }

      throw error;
    }
  }

  async login(dto: AuthDto)
  : Promise<{ token: string, twoFactorAuth: boolean }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: {
          email: dto.email
        }
      })
      if (!user) {
        throw new BadRequestException('Invalid email address')
      }
  
      const checkPassword = await argon.verify(user.password, dto.password)
      if (!checkPassword) {
        throw new BadRequestException('Invalid password')
      }
      
      const payload = { sub: user.id, email: user.email }
      const options = { expiresIn: '1h', secret: this.config.get<string>('JWT_SECRET') };  
      const token = await this.jwt.signAsync(payload, options);

      return { token, twoFactorAuth: user.twoFAEnabled };
    } catch (error) {
      throw error;
    }
  }

  async enable2FA(userId: number): Promise<string> {
    try {
      const secret = speakeasy.generateSecret();
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: true,
          twoFASecret: secret.base32
        }
      });
  
      return await qrCode.toDataURL(secret.otpauth_url, { errorCorrectionLevel: 'high' });
    } catch (error) {
      throw error;
    }
  }

  async disable2FA(userId: number): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: false,
          twoFASecret: null
        }
      });
    } catch (error) {
      throw error;
    }
  }

  async verify2FA(userId: number, dto: Verify2FADto): Promise<boolean> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });

      return speakeasy.totp.verify({
        secret: user.twoFASecret,
        token: dto.token,
        encoding: 'base32'
      });
    } catch (error) {
      throw error; 
    }
  }
}