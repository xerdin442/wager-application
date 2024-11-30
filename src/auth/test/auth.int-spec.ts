import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { DbService } from "../../db/db.service";
import { AuthService } from "../auth.service";
import { AuthDto, Verify2FADto } from "../dto/auth.dto";
import { ConfigService } from "@nestjs/config";

describe('Auth Service', () => {
  let prisma: DbService;
  let authService: AuthService;
  let config: ConfigService;
  let userId: number;

  const dto: AuthDto = {
    email: 'example@gmail.com',
    password: 'password'
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Creating and initializing Nest application
    const app = moduleRef.createNestApplication();

    // Database teardown logic before running tests
    prisma = app.get(DbService)
    await prisma.cleanDb();

    // Instantiate authentication service
    authService = app.get(AuthService);
    config = app.get(ConfigService)
  });

  describe('Signup', () => {
    it('should signup a new user', async () => {
      const user = await authService.signup(dto, config.get<string>('DEFAULT_IMAGE'));
      userId = user.id;
    });
  });

  describe('Login', () => {
    it('should login existing user', async () => {
      await authService.login(dto)
    })
  });

  describe('Enable 2FA', () => {
    it('should turn on 2FA for user', async () => {
      await authService.enable2FA(userId)
    })
  });

  describe('Disable 2FA', () => {
    it('should turn off 2FA for user', async () => {
      await authService.disable2FA(userId)
    })
  });

  describe('Verify 2FA', () => {
    it('should verify 2FA token', async () => {
      const dto: Verify2FADto = {
        token: '123456'
      };

      await authService.verify2FA(userId, dto)
    })
  });
})