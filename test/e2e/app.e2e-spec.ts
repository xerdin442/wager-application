import { Test } from '@nestjs/testing';
import { AppModule } from '@src/app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DbService } from '@src/db/db.service';
import {
  CreateUserDto,
  LoginDto,
  NewPasswordDto,
  PasswordResetDto,
  Verify2FADto,
  VerifyOTPDto
} from "@src/auth/dto";
import { UpdateProfileDto } from '@src/user/dto';
import { SessionService } from '@src/common/session';
import * as request from 'supertest'
import * as path from 'path';

describe('App e2e', () => {
  let app: INestApplication;
  let prisma: DbService;
  let session: SessionService;
  let accessToken: string;

  beforeAll(async () => {
    jest.useRealTimers();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Creating and initializing Nest application
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true
    }));

    await app.init();

    // Cleaning database and session store before running tests
    prisma = app.get(DbService);
    await prisma.cleanDb();

    session = app.get(SessionService);
    await session.onModuleInit();
    await session.clear();
  });

  afterAll(() => app.close());

  describe('Auth', () => {
    const signupDto: CreateUserDto = {
      email: 'jadawills3690@gmail.com',
      password: 'Xerdin442!',
      firstName: 'Xerdin',
      lastName: 'Ludac'
    }

    describe('Signup', () => {
      it('should throw if email format is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            ...signupDto,
            email: 'invalidEmail'
          })

        expect(response.status).toEqual(400);
        expect(response.body.message[0]).toEqual('Please enter a valid email address');
      });

      it('should throw if password is not strong enough', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send({
            ...signupDto,
            password: 'password'
          })

        expect(response.status).toEqual(400);
        expect(response.body.message[0]).toEqual('Password must contain at least one uppercase and lowercase letter, one digit and one symbol');
      });

      it('should throw if request body is empty', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')

        expect(response.status).toEqual(400);
      });

      it('should signup', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send(signupDto)

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
      }, 30000);
    });

    describe('Login', () => {
      const loginDto: LoginDto = {
        email: signupDto.email,
        password: signupDto.password
      };

      it('should throw if email format is invalid', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            ...loginDto,
            email: 'invalidEmail'
          })

        expect(response.status).toEqual(400);
        expect(response.body.message[0]).toEqual('Please enter a valid email address');
      });

      it('should login', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginDto)

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('twoFactorAuth');

        accessToken = response.body.token;
      });
    });

    describe('2FA', () => {
      it('should enable two factor authentication', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/enable')
          .set('Authorization', `Bearer ${accessToken}`)

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('qrcode');
      });

      it('should verify 2FA token', async () => {
        const dto: Verify2FADto = {
          token: '123456'
        };
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/verify')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(dto)

        expect(response.status).toEqual(400);
        expect(response.body.message).toEqual('Invalid token');
      });

      it('should disable two factor authentication', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/2fa/disable')
          .set('Authorization', `Bearer ${accessToken}`)

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual('2FA disabled successfully');
      });
    });

    describe('Password Reset', () => {
      it('should send password reset OTP to user email', async () => {
        const dto: PasswordResetDto = {
          email: signupDto.email
        };
        const response = await request(app.getHttpServer())
          .post('/auth/password/reset')
          .send(dto)

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual('Password reset OTP has been sent to your email');
      });

      it('should re-send password reset OTP to user email', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/password/resend-otp')

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual('Another OTP has been sent to your email');
      });

      it('should verify password reset OTP', async () => {
        const dto: VerifyOTPDto = {
          otp: '1234'
        };
        const response = await request(app.getHttpServer())
          .post('/auth/password/verify-otp')
          .send(dto)

        expect(response.status).toEqual(400);
        expect(response.body.message).toEqual('Invalid OTP');
      });

      it('should change password and complete reset', async () => {
        const dto: NewPasswordDto = {
          newPassword: 'PassWord12!'
        };
        const response = await request(app.getHttpServer())
          .post('/auth/password/new')
          .send(dto)

        expect(response.status).toEqual(200);
        expect(response.body.message).toEqual('Password reset complete!');
      });
    });
  });

  describe('User', () => {
    describe('Profile', () => {
      it('should throw if access token is missing', async () => {
        const response = await request(app.getHttpServer())
          .get('/users/profile')

        expect(response.status).toEqual(401);
        expect(response.body.message).toEqual('Unauthorized');
      });

      it('should return user profile', async () => {
        const response = await request(app.getHttpServer())
          .get('/users/profile')
          .set('Authorization', `Bearer ${accessToken}`)

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('user');
      });
    });

    describe('Update Profile', () => {
      const dto: UpdateProfileDto = { firstName: 'Nancy' };

      it('should update user profile', async () => {
        const response = await request(app.getHttpServer())
          .patch('/users/profile/update')
          .set('Authorization', `Bearer ${accessToken}`)
          .field({ ...dto })
          .attach('profileImage', path.resolve(__dirname, 'test-image.jpg'))

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('user');
      }, 30000);
    });

    describe('Delete Account', () => {
      it('should delete user profile', async () => {
        const response = await request(app.getHttpServer())
          .delete('/users/profile/delete')
          .set('Authorization', `Bearer ${accessToken}`)

        expect(response.status).toEqual(200);
      });
    });
  });
})