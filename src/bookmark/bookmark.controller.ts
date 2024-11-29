import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BookmarkService } from './bookmark.service';
import { GetUser } from '../user/decorators/user.decorator';
import { Bookmark, User } from '@prisma/client';
import { CreateBookmarkDto, UpdateBookmarkDto } from './dto/bookmark.dto';

@UseGuards(AuthGuard('jwt'))
@Controller('bookmarks')
export class BookmarkController {
  constructor(private bookmarkService: BookmarkService) { };

  @Get()
  async getBookmarks(@GetUser() user: User): Promise<{ bookmarks: Bookmark[] }> {
    return { bookmarks: await this.bookmarkService.getBookmarks(user.id) }
  }

  @Get(':id')
  async getBookmarkById(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) bookmarkId: number
  ): Promise<{ bookmark: Bookmark }> {
    return { bookmark: await this.bookmarkService.getBookmarkById(user.id, bookmarkId) }
  }

  @Post('create')
  async createBookmark(
    @GetUser() user: User,
    @Body() dto: CreateBookmarkDto
  ): Promise<{ bookmark: Bookmark }> {
    return { bookmark: await this.bookmarkService.createBookmark(user.id, dto) }
  }

  @Patch(':id/update')
  async updateBookmark(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) bookmarkId: number,
    @Body() dto: UpdateBookmarkDto
  ): Promise<{ bookmark: Bookmark }> {
    return { bookmark: await this.bookmarkService.updateBookmark(user.id, bookmarkId, dto) };
  }

  @Delete(':id/delete')
  async deleteBookmark(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) bookmarkId: number
  ): Promise<{ message: string }> {
    await this.bookmarkService.deleteBookmark(user.id, bookmarkId);
    return { message: 'Bookmark deleted successfully' };
  }
}
