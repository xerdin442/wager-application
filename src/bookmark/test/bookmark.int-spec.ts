import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { DbService } from "../../db/db.service";
import { BookmarkService } from "../bookmark.service";
import { CreateBookmarkDto, UpdateBookmarkDto } from "../dto/bookmark.dto";

describe('Bookmark Service', () => {
  let prisma: DbService;
  let bookmarkService: BookmarkService;
  let userId: number;
  let bookmarkId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    // Creating and initializing Nest application
    const app = moduleRef.createNestApplication();

    // Database teardown logic before running tests
    prisma = app.get(DbService)
    await prisma.cleanDb();

    // Instantiate bookmark service
    bookmarkService = app.get(BookmarkService)
  });

  describe('Create Bookmarks', () => {
    it('should create user', async () => {
      const user = await prisma.user.create({
        data: {
          email: 'example@gmail.com',
          password: 'password',
        }
      })

      userId = user.id;
    });

    it('should create bookmark', async () => {
      const dto: CreateBookmarkDto = {
        description: 'This is a test bookmark',
        title: 'Test bookmark'
      };
      
      const bookmark = await bookmarkService.createBookmark(userId, dto)
      bookmarkId = bookmark.id;
    })
  });

  describe('Get All Bookmarks', () => {
    it('should get all bookmarks', async () => {      
      await bookmarkService.getBookmarks(userId)
    })
  });

  describe('Get Bookmark', () => {
    it('should get bookmark by ID', async () => {
      await bookmarkService.getBookmarkById(userId, bookmarkId)
    })
  });

  describe('Update Bookmark', () => {
    it('should update bookmark by ID', async () => {
      const dto: UpdateBookmarkDto = {
        title: 'Updated Bookmark'
      };
      
      await bookmarkService.updateBookmark(userId, bookmarkId, dto)
    })
  });

  describe('Delete Bookmark', () => {
    it('should delete bookmark by ID', async () => {
      await bookmarkService.deleteBookmark(userId, bookmarkId)
    })
  });
})