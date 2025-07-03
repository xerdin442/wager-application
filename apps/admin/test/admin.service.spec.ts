import { AdminService } from '../src/admin.service';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuthDTO, CreateAdminDTO } from '../src/dto';
import { RpcException } from '@nestjs/microservices';
import { UtilsService } from '@app/utils';
import { DbService } from '@app/db';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon from 'argon2';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { Admin } from '@prisma/client';

// Mock randomUUID() for consistent string output
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'part1-part2-part3-part4'),
}));

describe('Admin Service', () => {
  let adminService: AdminService;
  let utils: DeepMocked<UtilsService>;
  let config: DeepMocked<ConfigService>;
  let jwt: DeepMocked<JwtService>;
  let prisma: DeepMocked<DbService>;

  const authDto: AdminAuthDTO = {
    email: 'super-admin@example.com',
    passcode: 'Passcode',
  };

  const createAdminDto: CreateAdminDTO = {
    category: 'FOOTBALL',
    email: 'admin2@example.com',
    name: 'Admin Two',
  };

  const admin: Admin = {
    id: 2,
    ...createAdminDto,
    passcode: 'Passcode',
    disputes: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    })
      .useMocker(createMock)
      .compile();

    adminService = module.get<AdminService>(AdminService);
    utils = module.get(UtilsService);
    config = module.get(ConfigService);
    jwt = module.get(JwtService);
    prisma = module.get(DbService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Signup', () => {
    const superAdmin: Admin = {
      ...admin,
      id: 1,
      email: authDto.email,
    };

    it('should signup and create Super Admin profile', async () => {
      jwt.signAsync.mockResolvedValue('signed-jwt-string');
      (prisma.admin.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.admin.create as jest.Mock).mockResolvedValue(superAdmin);

      const response = adminService.signup(authDto);
      await expect(response).resolves.toBe('signed-jwt-string');
    });

    it('should throw if Super Admin profile already exists', async () => {
      (prisma.admin.findMany as jest.Mock).mockResolvedValue([superAdmin]);

      const response = adminService.signup(authDto);
      await expect(response).rejects.toBeInstanceOf(RpcException);
      await expect(response).rejects.toThrow(
        'Only one Super Admin profile can be created',
      );
    });
  });

  describe('Add Admin', () => {
    it('should add new admin', async () => {
      (prisma.admin.create as jest.Mock).mockResolvedValue(admin);

      config.getOrThrow.mockImplementation((key: string) => {
        if (key === 'APP_NAME') return 'Wager Application';
        return undefined;
      });
      utils.sendEmail.mockResolvedValue(undefined);

      const response = adminService.addAddmin(createAdminDto);
      await expect(response).resolves.toBeUndefined();
    });

    it('should throw if an admin exists with email', async () => {
      (prisma.admin.create as jest.Mock).mockRejectedValue(
        new PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['email'] },
          },
        ),
      );

      const response = adminService.addAddmin(createAdminDto);
      await expect(response).rejects.toBeInstanceOf(RpcException);
      await expect(response).rejects.toThrow(
        'This email already exists. Please try again!',
      );
    });
  });

  describe('Login', () => {
    beforeEach(() => {
      config.getOrThrow.mockImplementation((key: string) => {
        if (key === 'APP_NAME') return 'Wager Application';
        return undefined;
      });

      jwt.signAsync.mockResolvedValue('signed-jwt-string');
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue(admin);
    });

    it('should throw if no admin exists with email', async () => {
      (prisma.admin.findUnique as jest.Mock).mockResolvedValue(null);

      const response = adminService.login({
        ...authDto,
        email: 'invalidEmail@gmail.com',
      });

      await expect(response).rejects.toBeInstanceOf(RpcException);
      await expect(response).rejects.toThrow(
        'No admin found with that email address',
      );
    });

    it('should throw if passcode is invalid', async () => {
      jest.spyOn(argon, 'verify').mockResolvedValue(false);

      const response = adminService.login({
        ...authDto,
        passcode: 'invalidPasscode',
      });

      await expect(response).rejects.toBeInstanceOf(RpcException);
      await expect(response).rejects.toThrow('Access denied. Invalid passcode');
    });

    it('should login', async () => {
      jest.spyOn(argon, 'verify').mockResolvedValue(true);

      const response = await adminService.login(authDto);
      expect(response.token).toEqual('signed-jwt-string');
      expect(response.admin).toEqual(admin);
    });
  });

  describe('Get All Admins', () => {
    it('should return all admins', async () => {
      (prisma.admin.findMany as jest.Mock).mockResolvedValue([admin]);

      const response = await adminService.getAllAdmins();
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Get Dispute Chats', () => {
    it('should return all dispute chats', async () => {
      (prisma.chat.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          adminId: admin.id,
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const response = await adminService.getDisputeChats(admin.id);
      expect(Array.isArray(response)).toBe(true);
    });
  });

  describe('Remove Admin', () => {
    it('should remove existing admin', async () => {
      (prisma.admin.delete as jest.Mock).mockResolvedValue(admin);

      const response = adminService.removeAddmin(admin.id);
      await expect(response).resolves.toEqual(admin.email);
    });
  });
});
