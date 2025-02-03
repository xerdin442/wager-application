import { Test } from "@nestjs/testing";
import { AppModule } from "@src/app.module";
import { DbService } from "@src/db/db.service";
import { UserService } from "@src/user/user.service";
import { UpdateProfileDto } from "@src/user/dto";
import { ConfigService } from "@nestjs/config";
import { User } from "@prisma/client";
import { Secrets } from "@src/common/env";

describe('User Service', () => {
  let prisma: DbService;
  let userService: UserService;
  let user: User;
  let config: ConfigService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Creating and initializing Nest application
    const app = moduleRef.createNestApplication();

    // Database teardown logic before running tests
    prisma = app.get(DbService);
    await prisma.cleanDb();

    userService = app.get(UserService);
    config = app.get(ConfigService);

    user = await prisma.user.create({
      data: {
        email: 'example@gmail.com',
        password: 'password',
        profileImage: Secrets.DEFAULT_IMAGE
      }
    });
  });

  describe('Update Profile', () => {
    it('should update user profile', async () => {
      const dto: UpdateProfileDto = {
        email: 'updatedemail@gmail.com'
      };

      await userService.updateProfile(user.id, dto);
    })
  });

  describe('Delete Account', () => {
    it('should delete user profile', async () => {
      await userService.deleteAccount(user.id);
    })
  });
})