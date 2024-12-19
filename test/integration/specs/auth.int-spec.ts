import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { DbService } from "../../../src/db/db.service";
import { AuthService } from "../../../src/auth/auth.service";
import {
  AuthDto,
  NewPasswordDto,
  PasswordResetDto,
  Verify2FADto,
  VerifyOTPDto
} from "../../../src/auth/dto";
import { ConfigService } from "@nestjs/config";
import { SessionData, SessionService } from "../../../src/common/session";

describe('Auth Service', () => {
  let prisma: DbService;
  let authService: AuthService;
  let config: ConfigService;
  let session: SessionService;
  let userId: number;
  let otp: string;
  let data: SessionData = {};

  const authDto: AuthDto = {
    email: 'example@gmail.com',
    password: 'password'
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Creating and initializing Nest application
    const app = moduleRef.createNestApplication();

    // Cleaning database and session store before running tests
    prisma = app.get(DbService)
    await prisma.cleanDb();

    session = app.get(SessionService)
    await session.clear();

    authService = app.get(AuthService);
    config = app.get(ConfigService)
  });

  describe('Signup', () => {
    it('should signup a new user', async () => {
      const { user } = await authService.signup(authDto, config.get<string>('DEFAULT_IMAGE'));
      userId = user.id;
    });
  });

  describe('Login', () => {
    it('should login existing user', async () => {
      await authService.login(authDto);
    })
  });

  describe('Enable 2FA', () => {
    it('should turn on 2FA for user', async () => {
      await authService.enable2FA(userId);
    })
  });

  describe('Disable 2FA', () => {
    it('should turn off 2FA for user', async () => {
      await authService.disable2FA(userId);
    })
  });

  describe('Verify 2FA', () => {
    it('should verify 2FA token', async () => {
      const dto: Verify2FADto = {
        token: '123456'
      };

      await authService.verify2FA(userId, dto);
    })
  });

  describe('Request Password Reset', () => {
    it('should send password reset OTP to user email', async () => {
      const dto: PasswordResetDto = {
        email: 'example@gmail.com'
      };

      otp = await authService.requestPasswordReset(dto, data);
    })
  });

  describe('Resend Password OTP', () => {
    it('should re-send password reset OTP to user email', async () => {
      otp = await authService.resendOTP(data);
    })
  });

  describe('Verify Password OTP', () => {
    it('should verify password reset OTP', async () => {
      const dto: VerifyOTPDto = { otp };
      authService.verifyOTP(dto, data);
    })
  });

  describe('Change Password', () => {
    it('should change password and complete reset', async () => {
      const dto: NewPasswordDto = {
        newPassword: 'PassWord'
      };

      await authService.changePassword(dto, data);
    })
  });

  describe('Logout', () => {
    it('should logout of current session', async () => {
      await authService.logout(authDto.email);
    })
  });
})