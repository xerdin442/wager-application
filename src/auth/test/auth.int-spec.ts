import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { DbService } from "../../db/db.service";
import { AuthService } from "../auth.service";
import { AuthDto } from "../dto/auth.dto";

describe('Auth Service', () => {
  let prisma: DbService;
  let authService: AuthService;

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
  });

  describe('Signup', () => {
    it('should signup a new user', async () => {
      await authService.signup(dto);
    });
  });

  describe('Login', () => {
    it('should login existing user', async () => {
      await authService.login(dto)
    })
  });
})