import { Controller, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { GoogleAuthPayload, SessionData } from './types';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from './dto';
import { User } from '@prisma/client';
import { UtilsService } from '@app/utils';
import { MetricsService } from '@app/metrics';

@Controller()
export class AuthController {
  private readonly context = AuthController.name;
  private sessionData: SessionData = {};

  constructor(
    private readonly authService: AuthService,
    private readonly utils: UtilsService,
    private readonly metrics: MetricsService,
  ) {}

  @MessagePattern('auth-metrics')
  async getMetrics(): Promise<Record<string, any>> {
    return this.metrics.getMetrics();
  }

  @MessagePattern('auth-signup')
  async signup(data: {
    details: SignupDTO | GoogleAuthPayload;
    file?: Express.Multer.File;
  }): Promise<{ user: User; token: string }> {
    try {
      const { details, file } = data;
      const response = await this.authService.signup(details, file);

      this.utils
        .logger()
        .info(
          `[${this.context}] User signup successful. Email: ${details.email}\n`,
        );

      return response;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred during user signup. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('auth-login')
  async login(data: {
    dto: LoginDTO;
  }): Promise<{ token: string; twoFactorAuth: boolean }> {
    try {
      const { dto } = data;
      const response = await this.authService.login(dto);

      this.utils
        .logger()
        .info(`[${this.context}] User login successful. Email: ${dto.email}\n`);

      return response;
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred during user login. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('logout')
  async logout(data: { user: User }): Promise<{ message: string }> {
    try {
      const { user } = data;
      await this.authService.logout(user.email);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${user.email} logged out of current session.\n`,
        );

      return { message: 'Logout successful!' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while logging out. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('enable-2fa')
  async enable2fa(data: { user: User }): Promise<{ qrcode: string }> {
    try {
      const { user } = data;
      const qrcode = await this.authService.enable2fa(user.id);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${user.email} enabled two factor authentication.\n`,
        );

      return { qrcode };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while enabling two factor authentication. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('disable-2fa')
  async disable2fa(data: { user: User }): Promise<{ message: string }> {
    try {
      const { user } = data;
      await this.authService.disable2fa(user.id);

      this.utils
        .logger()
        .info(
          `[${this.context}] ${user.email} disabled two factor authentication.\n`,
        );

      return { message: '2FA disabled successfully' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while disabling two factor authentication. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('verify-2fa')
  async verify2fa(data: {
    user: User;
    dto: Verify2faDTO;
  }): Promise<{ message: string }> {
    try {
      const { user, dto } = data;
      const verified = await this.authService.verify2fa(user.id, dto);

      if (verified) {
        this.utils
          .logger()
          .info(
            `[${this.context}] 2FA token verified successfully. Email: ${user.email}\n`,
          );

        return { message: '2FA token verified successfully' };
      } else {
        this.utils
          .logger()
          .error(
            `[${this.context}] Invalid 2FA token could not be verified. Email: ${user.email}\n`,
          );

        throw new RpcException({
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid token',
        });
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while verifying 2FA token. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('reset-password')
  async requestPasswordReset(data: {
    dto: PasswordResetDTO;
  }): Promise<{ message: string }> {
    try {
      const { dto } = data;
      await this.authService.requestPasswordReset(dto, this.sessionData);

      this.utils
        .logger()
        .info(`[${this.context}] Password reset requested by ${dto.email}.\n`);

      return { message: 'Password reset OTP has been sent to your email' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while requesting for password reset. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('resend-reset-otp')
  async resendOtp(): Promise<{ message: string }> {
    try {
      await this.authService.resendOtp(this.sessionData);
      this.utils
        .logger()
        .info(
          `[${this.context}] Password reset OTP re-sent to ${this.sessionData.email}.\n`,
        );

      return { message: 'Another OTP has been sent to your email' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while verifying password reset OTP. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('verify-reset-otp')
  async verifyOtp(data: { dto: VerifyOtpDTO }): Promise<{ message: string }> {
    try {
      const { dto } = data;
      await this.authService.verifyOtp(dto, this.sessionData);

      this.utils
        .logger()
        .info(
          `[${this.context}] OTP verification successful. Email: ${this.sessionData.email}\n`,
        );

      return { message: 'OTP verification successful!' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while verifying password reset OTP. Error: ${error.message}\n`,
        );

      throw error;
    }
  }

  @MessagePattern('new-password')
  async changePassword(data: {
    dto: NewPasswordDTO;
  }): Promise<{ message: string }> {
    try {
      const { dto } = data;
      const email = this.sessionData.email;
      await this.authService.changePassword(dto, this.sessionData);

      this.utils
        .logger()
        .info(`[${this.context}] Password reset completed by ${email}.\n`);

      return { message: 'Password reset complete!' };
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while changing password. Error: ${error.message}\n`,
        );

      throw error;
    }
  }
}
