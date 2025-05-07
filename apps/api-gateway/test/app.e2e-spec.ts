import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SessionService } from 'apps/auth/src/session';
import { DbService } from '@app/db';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from '../src/auth/dto';
import * as path from 'path';

describe('E2E Tests', () => {
  const requestTimeout: number = 30000;

  let app: INestApplication<App>;
  let prisma: DbService;
  let session: SessionService;
  let jwt: string;
  // let googleAuthRedirectUrl: string;

  beforeAll(async () => {
    jest.useRealTimers();

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
      }),
    );

    // Clean database and session store before running tests
    prisma = app.get(DbService);
    await prisma.cleanDb();

    session = app.get(SessionService);
    await session.onModuleInit();
    await session.clear();

    await app.init();
  });

  afterAll(() => app.close());

  describe('Auth', () => {
    const signupDto: SignupDTO = {
      email: 'xerdinludac@gmail.com',
      password: 'Xerdin442!',
      firstName: 'Xerdin',
      lastName: 'Ludac',
      username: 'xerdin442',
    };

    describe('Signup', () => {
      it('should throw if email format is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            ...signupDto,
            email: 'Invalid email',
          });

        expect(response.status).toEqual(400);
        expect(response.body.message[0]).toEqual(
          'Please enter a valid email address',
        );
      });

      it('should throw if password is not strong enough', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            ...signupDto,
            password: 'Weak password',
          });

        expect(response.status).toEqual(400);
        expect(response.body.message[0]).toEqual(
          'Password must contain at least one uppercase and lowercase letter, one digit and one symbol',
        );
      });

      it('should throw if request body is empty', async () => {
        const response = await request(app.getHttpServer()).post(
          '/auth/signup',
        );

        expect(response.status).toEqual(400);
      });

      it(
        'should signup without file',
        async () => {
          const response = await request(app.getHttpServer())
            .post('/auth/signup')
            .send(signupDto);

          expect(response.status).toEqual(201);
          expect(response.body).toHaveProperty('user');
          expect(response.body).toHaveProperty('token');
        },
        requestTimeout,
      );

      it(
        'should signup with file',
        async () => {
          const response = await request(app.getHttpServer())
            .post('/auth/signup')
            .field({
              email: 'jadawills3690@gmail.com',
              firstName: 'Jada',
              lastName: 'Williams',
              password: 'Jada987@',
              username: 'jada_wills',
            })
            .attach('profileImage', path.resolve(__dirname, 'test-image.jpg'));

          expect(response.status).toEqual(201);
          expect(response.body).toHaveProperty('user');
          expect(response.body).toHaveProperty('token');
        },
        requestTimeout,
      );
    });

    describe('Login', () => {
      const loginDto: LoginDTO = {
        email: signupDto.email,
        password: signupDto.password,
      };

      it('should throw if email format is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            ...loginDto,
            email: 'Invalid email',
          });

        expect(response.status).toEqual(400);
        expect(response.body.message[0]).toEqual(
          'Please enter a valid email address',
        );
      });

      it('should login', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('twoFactorAuth');

        // Store JWT to make authorized requests
        jwt = response.body.token as string;
      });
    });

    describe('Google Auth', () => {
      it('should redirect to Google login page', async () => {
        return request(app.getHttpServer())
          .get('/auth/google/login')
          .expect(200);
      });
    });

    describe('2FA', () => {
      it('should enable 2FA and return QRcode image', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/enable')
          .set('Authorization', `Bearer ${jwt}`);

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('qrcode');
      });

      it('should verify 2FA token', async () => {
        const dto: Verify2faDTO = {
          token: '123456',
        };
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/verify')
          .set('Authorization', `Bearer ${jwt}`)
          .send(dto);

        expect(response.status).toEqual(400);
        expect(response.body.message).toEqual('Invalid token');
      });

      it('should disable 2FA', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/disable')
          .set('Authorization', `Bearer ${jwt}`);

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual('2FA disabled successfully');
      });
    });

    describe('Password Reset', () => {
      it('should send password reset OTP to user email', async () => {
        const dto: PasswordResetDTO = {
          email: signupDto.email,
        };
        const response = await request(app.getHttpServer())
          .post('/auth/password/reset')
          .send(dto);

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual(
          'Password reset OTP has been sent to your email',
        );
      });

      it('should re-send password reset OTP to user email', async () => {
        const response = await request(app.getHttpServer()).post(
          '/auth/password/resend-otp',
        );

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual(
          'Another OTP has been sent to your email',
        );
      });

      it('should verify password reset OTP', async () => {
        const dto: VerifyOtpDTO = {
          otp: '1234',
        };
        const response = await request(app.getHttpServer())
          .post('/auth/password/verify-otp')
          .send(dto);

        expect(response.status).toEqual(400);
        expect(response.body.message).toEqual('Invalid OTP');
      });

      it('should change password and complete reset', async () => {
        const dto: NewPasswordDTO = {
          newPassword: 'PassWord12!',
        };
        const response = await request(app.getHttpServer())
          .post('/auth/password/new')
          .send(dto);

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual('Password reset complete!');
      });
    });
  });
});
