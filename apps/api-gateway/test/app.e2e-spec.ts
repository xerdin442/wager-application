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
import { FundsTransferDTO, UpdateProfileDTO } from '../src/user/dto';
import { FiatAmountDTO, FiatWithdrawalDTO } from '../src/fiat/dto';
import {
  CreateWagerDTO,
  UpdateWagerDTO,
  WagerInviteDTO,
} from '../src/wager/dto';
import { AdminAuthDTO, CreateAdminDTO } from '../src/admin/dto';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import { CryptoWithdrawalDTO } from '../src/wallet/dto';

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
  const adminDto: CreateAdminDTO = {
    email: 'xerdinludac@gmail.com',
    category: 'FOOTBALL',
    name: 'Xerdin Ludac',
  };

  let app: INestApplication<App>;
  let prisma: DbService;
  let session: SessionService;
  let config: ConfigService;
  let userOneToken: string;
  let userTwoToken: string;
  let wagerId: number;
  let wagerInviteCode: string;
  let superAdminToken: string;
  let adminToken: string;

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

    config = app.get(ConfigService);

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
    it('should return Paystack checkout link for fiat deposit', async () => {
      const dto: FiatAmountDTO = { amount: 100 };

      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/deposit')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('checkout');
    });

    it('should return ethereum address for stablecoin deposit on Base', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/crypto/deposit?chain=base')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('address');
    });

    it('should return solana address for stablecoin deposit on Solana', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/crypto/deposit?chain=solana')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('address');
    });

    it('should throw if chain parameter in stablecoin deposit is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/crypto/deposit?chain=INVALID')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Invalid value for chain query parameter. Expected "base" or "solana".',
      );
    });
  });

  describe('Create Wager', () => {
    const dto: CreateWagerDTO = {
      category: 'FOOTBALL',
      conditions: 'Real Madrid wins the Champions League',
      stake: 10,
      title: 'UCL Winner',
    };

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
      // Increment user balances
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

    it('should return all wagers for a user', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/wagers')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wagers');
    });
  });

  describe('Update Wager', () => {
    const dto: UpdateWagerDTO = {
      conditions: 'Real Madrid wins the UCL at the end of the season',
    };

    it('should update wager details', async () => {
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

    it('should return wager details from invite code', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/invite`)
        .set('Authorization', `Bearer ${userTwoToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('wager');
    });
  });

  describe('Join Wager', () => {
    it('should join wager', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/join`)
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Successfully joined wager');
    });
  });

  describe('Wager Claim', () => {
    it('should claim wager prize', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/claim`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Prize claimed successfully, awaiting response from opponent',
      );
    });

    it('should accept wager prize claim', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/claim/accept`)
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Wager claim accepted, better luck next time!',
      );
    });

    it('should contest wager prize claim', async () => {
      await prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'ACTIVE' },
      });

      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/claim/contest`)
        .set('Authorization', `Bearer ${userTwoToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Wager claim contested, dispute resolution has been initiated.',
      );
    });
  });

  describe('Admins', () => {
    it('should create super admin profile', async () => {
      const dto: AdminAuthDTO = {
        email: 'mudianthonio27@gmail.com',
        passcode: 'SuperAdminPasscode',
      };

      const response = await request(app.getHttpServer())
        .post('/admin/signup')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Super Admin created successfully');

      superAdminToken = response.body.token as string;
    });

    it('should add new admin', async () => {
      const response = await request(app.getHttpServer())
        .post('/admin/add')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send(adminDto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('New admin added successfully');
    });

    it('should remove existing admin', async () => {
      const response = await request(app.getHttpServer())
        .post(`/admin/remove?email=${adminDto.email}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        'Admin profile deleted successfully',
      );
    });

    it('should login admin', async () => {
      const admin = await prisma.admin.create({
        data: {
          ...adminDto,
          disputes: 0,
          passcode: 'AdminPasscode',
        },
      });
      const dto: AdminAuthDTO = { ...admin };

      const response = await request(app.getHttpServer())
        .post('/admin/login')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('token');

      adminToken = response.body.token as string;
    });

    it('should retrieve all admins', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('admins');
    });

    it('should retrieve all dispute resolution chats for an admin', async () => {
      const response = await request(app.getHttpServer())
        .get(`/admin/disputes`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('chats');
    });
  });

  describe('Dispute Resolution', () => {
    it('should retrieve all dispute chat messages as a player', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/dispute/chat`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('messages');
    });

    it('should retrieve all dispute chat messages as an admin', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/dispute/chat`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('messages');
    });

    it('should assign winner after dispute resolution', async () => {
      const response = await request(app.getHttpServer())
        .post(`/wagers/${wagerId}/dispute/resolve?username=${userOne.username}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Dispute resolution successful');
    });
  });

  describe('Funds Transfer', () => {
    it('should transfer funds from user wallet to another user', async () => {
      const dto: FundsTransferDTO = {
        amount: 20,
        username: userTwo.username,
      };

      const response = await request(app.getHttpServer())
        .post('/user/wallet/transfer')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual(
        `$${dto.amount} transfer to @${dto.username} was successful!`,
      );
    });
  });

  describe('Fiat Conversion', () => {
    const dto: FiatAmountDTO = { amount: 100 };

    it('should convert NGN to USD', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/convert?targetCurrency=USD')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('amount');
      expect(response.body).toHaveProperty('from');
      expect(response.body.from).toEqual('NGN');
      expect(response.body).toHaveProperty('to');
      expect(response.body.to).toEqual('USD');
    });

    it('should convert USD to NGN', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/convert?targetCurrency=NGN')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('amount');
      expect(response.body).toHaveProperty('from');
      expect(response.body.from).toEqual('USD');
      expect(response.body).toHaveProperty('to');
      expect(response.body.to).toEqual('NGN');
    });
  });

  describe('Fiat Withdrawal', () => {
    const dto: FiatWithdrawalDTO = {
      amount: 15,
      accountName: config.getOrThrow<string>('ACCOUNT_NAME'),
      accountNumber: config.getOrThrow<string>('ACCOUNT_NUMBER'),
      bankName: config.getOrThrow<string>('BANK_NAME'),
    };

    it('should return all supported banks for fiat withdrawal', async () => {
      const response = await request(app.getHttpServer()).get(
        '/wallet/fiat/withdraw/banks',
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('banks');
    });

    it('should return recent account details for fiat withdrawal', async () => {
      const response = await request(app.getHttpServer()).get(
        '/wallet/fiat/withdraw/recent',
      );

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('details');
    });

    it('should throw if idempotency key is missing', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toEqual('"Idempotency-Key" header is required');
    });

    it('should throw if withdrawal amount exceeds user balance', async () => {
      const user = (await prisma.user.findUnique({
        where: { email: userOne.email },
      })) as User;

      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY')
        .send({
          ...dto,
          amount: 1000,
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toEqual(
        `Insufficient funds. $${user.balance} is available for withdrawal`,
      );
    });

    it('should throw if withdrawal amount is below the allowed minimum', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY')
        .send({
          ...dto,
          amount: 4.5,
        });

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toEqual('Minimum withdrawal amount is $5');
    });

    it('should initiate processing of fiat withdrawal', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toEqual('Your withdrawal is being processed');
    });

    it('should prevent duplicate processing of similar fiat withdrawal', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/fiat/withdraw')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY')
        .send(dto);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toEqual('Your withdrawal is still being processed');
    });

    it('should return all transactions for a user', async () => {
      const response = await request(app.getHttpServer())
        .get('/user/transactions')
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('transactions');
    });
  });

  describe('Paystack Webhook', () => {
    it('should receive 200 OK response from callback url', async () => {
      const response = await request(app.getHttpServer()).post(
        '/wallet/fiat/callback',
      );

      expect(response.status).toEqual(200);
    });
  });

  describe('Crypto Withdrawal', () => {
    const dto: CryptoWithdrawalDTO = {
      amount: 8,
      address: '0x',
    };

    it('should throw if chain parameter is invalid', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/crypto/withdraw?chain=INVALID')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY')
        .send(dto);

      expect(response.status).toEqual(400);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toEqual(
        'Invalid value for chain query parameter. Expected "base" or "solana".',
      );
    });

    it('should process stablecoin withdrawal on Base', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/crypto/withdraw?chain=base')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY-BASE')
        .send(dto);

      expect(response.status).toEqual(200);
    });

    it('should process stablecoin withdrawal on Solana', async () => {
      const response = await request(app.getHttpServer())
        .post('/wallet/crypto/withdraw?chain=solana')
        .set('Authorization', `Bearer ${userOneToken}`)
        .set('Idempotency-Key', 'IDEMPOTENCY-KEY-SOLANA')
        .send({
          ...dto,
          address: '',
        });

      expect(response.status).toEqual(200);
    });
  });

  describe('End tests', () => {
    it('should delete wager', async () => {
      await prisma.wager.update({
        where: { id: wagerId },
        data: { status: 'PENDING' },
      });

      const response = await request(app.getHttpServer())
        .delete(`/wagers/${wagerId}`)
        .set('Authorization', `Bearer ${userOneToken}`);

      expect(response.status).toEqual(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toEqual('Wager deleted successfully');
    });

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
