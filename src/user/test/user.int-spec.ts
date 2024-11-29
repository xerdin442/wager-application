import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { DbService } from "../../db/db.service";
import { UserService } from "../user.service";
import { updateProfileDto } from "../dto/user.dto";

describe('User Service', () => {
  let prisma: DbService;
  let userService: UserService;
  let userId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Creating and initializing Nest application
    const app = moduleRef.createNestApplication();

    // Database teardown logic before running tests
    prisma = app.get(DbService)
    await prisma.cleanDb();

    // Instantiate user service
    userService = app.get(UserService)
  });

  describe('Update Profile', () => {
    it('should create user', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'example@gmail.com',
          password: 'password',
        }
      })

      userId = user.id;
    });

    it('should update user profile', async () => {
      const dto: updateProfileDto = {
        email: 'updatedemail@gmail.com'
      };
      
      await userService.updateProfile(userId, dto)
    })
  });

  describe('Delete Account', () => {
    it('should delete user profile', async () => { 
      await userService.deleteAccount(userId)
    })
  });
})