import { DbService } from '@app/db';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TestingModule, Test } from '@nestjs/testing';
import { SessionService } from 'apps/auth/src/session';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import * as request from 'supertest';
import * as path from 'path';
import {
  LoginDTO,
  NewPasswordDTO,
  PasswordResetDTO,
  SignupDTO,
  Verify2faDTO,
  VerifyOtpDTO,
} from '../src/auth/dto';
// import { CreateAdminDTO } from '../src/admin/dto';
import { UpdateProfileDTO } from '../src/user/dto';

describe('E2E Tests', () => {
  const requestTimeout: number = 30000;

  const userOne: SignupDTO = {
    email: 'xerdinludac@gmail.com',
    password: 'Xerdin442!',
    firstName: 'Xerdin',
    lastName: 'Ludac',
    username: 'xerdin442',
  };
  const userTwo: SignupDTO = {
    email: 'jadawills3690@gmail.com',
    firstName: 'Jada',
    lastName: 'Williams',
    password: 'Jada987@',
    username: 'jada_wills',
  };

  // const admin: CreateAdminDTO = {
  //   email: 'ozunabiraz3@hotmail.com',
  //   category: 'FOOTBALL',
  //   name: 'Ozuna Biraz',
  // };

  let app: INestApplication<App>;
  let prisma: DbService;
  let session: SessionService;
  let userOneToken: string;
  // let userTwoToken: string;
  // let wagerId: number;
  // let wagerInviteCode: string;
  // let superAdminToken: string;
  // let adminToken: string;

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

  describe('Signup', () => {
    it('should throw if email format is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          ...userOne,
          email: 'Invalid email',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Please enter a valid email address',
      );
    });

    it('should throw if password is not strong enough', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({
          ...userOne,
          password: 'Weak password',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Password must contain at least one uppercase and lowercase letter, one digit and one symbol',
      );
    });

    it('should throw if request body is empty', async () => {
      const response = await request(app.getHttpServer()).post('/auth/signup');

      expect(response.status).toEqual(400);
      expect(Array.isArray(response.body.message)).toBe(true);
      expect(response.body.message.length).toBeGreaterThan(1);
    });

    it(
      'should signup without file upload',
      async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .send(userOne);

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');
      },
      requestTimeout,
    );

    it(
      'should signup with file upload',
      async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/signup')
          .field({ ...userTwo })
          .attach('profileImage', path.resolve(__dirname, 'test-image.jpg'));

        expect(response.status).toEqual(201);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('token');

        // Store JWT to to access authorized endpoints
        // userTwoToken = response.body.token as string;
      },
      requestTimeout,
    );
  });

  describe('Login', () => {
    const loginDto: LoginDTO = { ...userOne };

    it('should throw if email format is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          ...loginDto,
          email: 'Invalid email',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual(
        'Please enter a valid email address',
      );
    });

    it('should login user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(loginDto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('twoFactorAuth');

      // Store JWT to to access authorized endpoints
      userOneToken = response.body.token as string;
    });
  });

  describe('Google Auth', () => {
    it('should redirect to Google login page', async () => {
      return request(app.getHttpServer())
        .get('/auth/google?redirectUrl=/dashboard')
        .expect(200);
    });

    it('should throw if redirect URL is missing', async () => {
      const response = await request(app.getHttpServer()).get('/auth/google');

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Missing redirect URL');
    });
  });

  describe('2FA', () => {
    it('should enable 2FA and return QRcode image', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/2fa/enable')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('qrcode');
    });

    it('should verify 2FA token', async () => {
      const dto: Verify2faDTO = {
        token: '123456',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/2fa/verify')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Invalid token');
    });

    it('should disable 2FA', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/2fa/disable')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('2FA disabled successfully');
    });
  });

  describe('Password Reset', () => {
    it('should send password reset OTP to user email', async () => {
      const dto: PasswordResetDTO = { ...userOne };

      const response = await request(app.getHttpServer())
        .post('/auth/password/reset')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Password reset OTP has been sent to your email',
      );
    });

    it('should re-send password reset OTP to user email', async () => {
      const response = await request(app.getHttpServer()).post(
        '/auth/password/resend-otp',
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
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
      expect(response.body).toHaveProperty('message');
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
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Password reset complete!');
    });
  });

  describe('Profile', () => {
    it('should throw if access token is missing', async () => {
      const response = await request(app.getHttpServer()).get('/user/profile');

      expect(response.status).toEqual(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Unauthorized');
    });

    it('should retrieve user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/profile')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('user');
    });

    it(
      'should update user profile',
      async () => {
        const dto: UpdateProfileDTO = { firstName: 'Cristiano' };

        const response = await request(app.getHttpServer())
          .patch('/user/profile')
          .set('Authorization', `Bearer ${userOneToken}`)
          .field({ ...dto })
          .attach('profileImage', path.resolve(__dirname, 'test-image.jpg'));

        expect(response.status).toEqual(200);
        expect(response.body).toHaveProperty('user');
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toEqual('Profile updated successfully');
      },
      requestTimeout,
    );
  });

  // describe('Depsoit', () => {
  //   it('should throw if chain is invalid', async () => {});

  //   it('should throw if transaction identifier is invalid', async () => {});

  //   it('should throw if depositor address is invalid', async () => {});

  //   it('should throw if pending transaction and inititate processing of deposit', async () => {});
  // });
});
