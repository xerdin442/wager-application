import { DbService } from '@app/db';
import { MetricsService } from '@app/metrics';
import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Queue } from 'bull';
import * as argon from 'argon2';
import { SessionService } from './session';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import * as speakeasy from 'speakeasy';
import * as qrCode from 'qrcode';
import { User } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { SessionData } from './types';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from './dto';
import { ConfigService } from '@nestjs/config';
import { createWallet } from './utils';
import { UtilsService } from '@app/utils';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: DbService,
    private readonly jwt: JwtService,
    private readonly sessionService: SessionService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
    private readonly utils: UtilsService,
    @InjectQueue('auth-queue') private readonly authQueue: Queue,
    @Inject('CRYPTO_SERVICE') private readonly natsClient: ClientProxy,
  ) {}

  async signup(
    dto: SignupDTO,
    file?: Express.Multer.File,
  ): Promise<{ user: User; token: string }> {
    try {
      // Generate wallets for crypto transactions
      const ethWallet = await createWallet(this.natsClient, { chain: 'base' });
      const solWallet = await createWallet(this.natsClient, {
        chain: 'solana',
      });

      // Upload file to AWS if available
      const filePath = await this.utils.upload(
        file as Express.Multer.File,
        'profile-images',
      );

      // Hash password and create new user
      const hash = await argon.hash(dto.password);
      const user = await this.prisma.user.create({
        data: {
          ...dto,
          password: hash,
          profileImage:
            filePath || this.config.getOrThrow<string>('DEFAULT_IMAGE'),
          ethAddress: ethWallet.address,
          ethPrivateKey: ethWallet.privateKey,
          solAddress: solWallet.address,
          solPrivateKey: solWallet.privateKey,
          balance: 0,
        },
      });

      const payload = { sub: user.id, email: user.email, admin: false }; // Create JWT payload

      // Send an onboarding email to the new user
      await this.authQueue.add('signup', { user });
      // Process wallet monitoring and prefilling with gas fees
      await this.authQueue.add('setup-wallet', { user });

      // Sanitize user output
      user.password = '';
      user.ethAddress = '';
      user.ethPrivateKey = '';
      user.solAddress = '';
      user.solPrivateKey = '';

      return { user, token: await this.jwt.signAsync(payload) };
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const meta = error.meta as Record<string, any>;
          throw new RpcException({
            status: 400,
            message: `This ${meta.target[0]} already exists. Please try again!`,
          });
        }
      }

      throw error;
    }
  }

  async login(
    dto: LoginDTO,
  ): Promise<{ token: string; twoFactorAuth: boolean }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      // Check if user is found with given email address
      if (!user) {
        throw new RpcException({
          status: 400,
          message: 'No user found with that email address',
        });
      }

      // Check if password is valid
      const checkPassword = await argon.verify(user.password, dto.password);
      if (!checkPassword) {
        throw new RpcException({
          status: 400,
          message: 'Invalid password',
        });
      }

      const payload = { sub: user.id, email: user.email, admin: false }; // Create JWT payload

      return {
        token: await this.jwt.signAsync(payload),
        twoFactorAuth: user.twoFAEnabled,
      };
    } catch (error) {
      throw error;
    }
  }

  async logout(email: string): Promise<void> {
    try {
      await this.sessionService.delete(email);
    } catch (error) {
      throw error;
    }
  }

  async enable2fa(userId: number): Promise<string> {
    try {
      const user = (await this.prisma.user.findUnique({
        where: { id: userId },
      })) as User;
      const secret = speakeasy.generateSecret({
        name: `${this.config.getOrThrow<string>('APP_NAME')}:${user.email}`,
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: true,
          twoFASecret: secret.base32,
        },
      });

      this.metrics.updateGauge('two_fa_enabled_users', 'inc'); // Update metrics value

      // Create a QRcode image with the generated secret
      return qrCode.toDataURL(secret.otpauth_url as string, {
        errorCorrectionLevel: 'high',
      });
    } catch (error) {
      throw error;
    }
  }

  async disable2fa(userId: number): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          twoFAEnabled: false,
          twoFASecret: null,
        },
      });

      this.metrics.updateGauge('two_fa_enabled_users', 'dec'); // Update metrics value
      return;
    } catch (error) {
      throw error;
    }
  }

  async verify2fa(userId: number, dto: Verify2faDTO): Promise<boolean> {
    try {
      const user = (await this.prisma.user.findUnique({
        where: { id: userId },
      })) as User;

      return speakeasy.totp.verify({
        secret: user.twoFASecret as string,
        token: dto.token,
        encoding: 'base32',
      });
    } catch (error) {
      throw error;
    }
  }

  async requestPasswordReset(
    dto: PasswordResetDTO,
    data: SessionData,
  ): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (user) {
        // Set the OTP value and expiration time, and store them in session
        data.email = dto.email;
        data.otp = `${Math.random() * 10 ** 16}`.slice(3, 7);
        data.otpExpiration = Date.now() + 60 * 60 * 1000;

        await this.sessionService.set(dto.email, data);

        // Send the OTP via email
        await this.authQueue.add('otp', { user, otp: data.otp });

        return data.otp;
      } else {
        throw new RpcException({
          status: 400,
          message: 'No user found with that email address',
        });
      }
    } catch (error) {
      throw error;
    }
  }

  async resendOtp(data: SessionData): Promise<string> {
    try {
      // Retrieve existing session data
      const session = await this.sessionService.get(data.email as string);
      if (session.email) {
        // Reset the OTP value and expiration time
        data.otp = `${Math.random() * 10 ** 16}`.slice(3, 7);
        data.otpExpiration = Date.now() + 60 * 60 * 1000;
        await this.sessionService.set(data.email as string, data);

        // Send another email with the new OTP
        await this.authQueue.add('otp', {
          email: data.email,
          otp: data.otp,
        });

        return data.otp;
      } else {
        throw new RpcException({
          status: 400,
          message: 'Email not found',
        });
      }
    } catch (error) {
      throw error;
    }
  }

  async verifyOtp(dto: VerifyOtpDTO, data: SessionData): Promise<void> {
    try {
      // Retrieve existing session data
      const session = await this.sessionService.get(data.email as string);
      // Check if OTP is invalid or expired
      if (session.email) {
        if (session.otp !== dto.otp) {
          throw new RpcException({
            status: 400,
            message: 'Invalid OTP',
          });
        }

        if ((session.otpExpiration as number) < Date.now()) {
          throw new RpcException({
            status: 400,
            message: 'This OTP has expired',
          });
        }
      }

      return;
    } catch (error) {
      throw error;
    }
  }

  async changePassword(dto: NewPasswordDTO, data: SessionData): Promise<void> {
    try {
      // Retrieve existing session data
      const session = await this.sessionService.get(data.email as string);
      // Find user with email stored in session
      const user = await this.prisma.user.findUnique({
        where: { email: session.email },
      });

      if (user) {
        // Check if the previous password is same as the new password
        const samePassword = await argon.verify(user.password, dto.newPassword);
        if (samePassword) {
          throw new RpcException({
            status: 400,
            message:
              'New password cannot be the same value as previous password',
          });
        }

        // Hash new password and update the user's password
        const hash = await argon.hash(dto.newPassword);
        await this.prisma.user.update({
          where: { email: session.email },
          data: { password: hash },
        });

        // Clear session data after completing password reset
        delete data.email;
        delete data.otp;
        delete data.otpExpiration;
        await this.sessionService.set(user.email, data);

        return;
      } else {
        throw new RpcException({
          status: 400,
          message: 'Email not found',
        });
      }
    } catch (error) {
      throw error;
    }
  }
}
