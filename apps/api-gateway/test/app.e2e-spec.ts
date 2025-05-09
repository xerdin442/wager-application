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
import { UpdateProfileDTO } from '../src/user/dto';
import { FiatAmountDTO } from '../src/fiat/dto';
import {
  CreateWagerDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from '../src/wager/dto';

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

  let app: INestApplication<App>;
  let prisma: DbService;
  let session: SessionService;
  let userOneToken: string;
  let userTwoToken: string;
  let wagerId: number;
  let wagerInviteCode: string;

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
        userTwoToken = response.body.token as string;
      },
      requestTimeout,
    );
  });

  describe('Login', () => {
    const loginDto: LoginDTO = {
      email: userOne.email,
      password: userOne.password,
    };

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

    it('should login', async () => {
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
        .get('/auth/google/login?redirectUrl=/dashboard')
        .expect(200);
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
      const dto: PasswordResetDTO = {
        email: userOne.email,
      };
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
        const dto: UpdateProfileDTO = { firstName: 'Ronaldo' };

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

  describe('Deposit', () => {
    it('should return Paystack checkout link for deposit', async () => {
      const dto: FiatAmountDTO = { amount: 100 };

      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/checkout')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('checkout');
    });

    it('should increment user balances', async () => {
      await prisma.$transaction([
        prisma.user.update({
          where: { email: userOne.email },
          data: { balance: { increment: 50 } },
        }),
        prisma.user.update({
          where: { email: userTwo.email },
          data: { balance: { increment: 50 } },
        }),
      ]);
    });
  });

  describe('Create Wager', () => {
    const dto: CreateWagerDTO = {
      category: 'FOOTBALL',
      conditions: 'Real Madrid wins the Champions League',
      stake: 10,
      title: 'UCL Winner',
    };

    it('should throw if stake is less than allowed minimum', async () => {
      const response = await request(app.getHttpServer())
        .post('/wagers/create')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send({
          ...dto,
          stake: 0.5,
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Minimum stake is $1');
    });

    it('should throw if user balance is insufficient', async () => {
      const response = await request(app.getHttpServer())
        .post('/wagers/create')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send({
          ...dto,
          stake: 100,
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Insufficient balance');
    });

    it('should throw if wager category is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/wagers/create')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send({
          ...dto,
          category: 'INVALID CATEGORY',
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message[0]).toEqual('Invalid wager category value');
    });

    it('should create a new wager', async () => {
      const response = await request(app.getHttpServer())
        .post('/wagers/create')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wager');

      wagerId = response.body.wager.id as number;
      wagerInviteCode = response.body.wager.inviteCode as string;
    });

    it('should return wager details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wager');
    });
  });

  describe('Update Wager', () => {
    const dto: UpdateWagerDTO = {
      conditions: 'Real Madrid wins the UCL at the end of the season',
    };

    it('should throw if the user is not the wager creator', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userTwoToken}`)
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Details of a wager can only be modified by its creator',
      );
    });

    it('should throw if the wager is already active', async () => {
      await prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'ACTIVE' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Details of an active wager cannot be modified',
      );
    });

    it('should update wager details', async () => {
      // Reset wager status
      await prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'PENDING' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Wager updated successfully');
    });
  });

  describe('Wager Invite', () => {
    const dto: WagerInviteDTO = { inviteCode: wagerInviteCode };

    it('should throw if invite code is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/invite`)
        .set('Authorization', `Bearer ${userTwoToken}`)
        .send({ inviteCode: 'Invalid Code' });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Invalid wager invite code');
    });

    it('should return wager details from invite code', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/invite`)
        .set('Authorization', `Bearer ${userTwoToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wager');
    });
  });

  describe('End tests', () => {
    it('should log out user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Logout successful!');
    });

    it('should delete user profile', async () => {
      const response = await request(app.getHttpServer())
        .delete('/user/profile')
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Account deleted successfully');
    });
  });
});
