import { Injectable } from '@nestjs/common';
import { CreateBookmarkDto, UpdateBookmarkDto } from './dto/bookmark.dto';
import { DbService } from '../db/db.service';
import { Bookmark } from '@prisma/client';

@Injectable()
export class BookmarkService {
  constructor(private prisma: DbService) { };

  getBookmarks(userId: number): Promise<Bookmark[]> {
    return this.prisma.bookmark.findMany({
      where: { userId }
    })
  }

  getBookmarkById(userId: number, bookmarkId: number): Promise<Bookmark> {
    return this.prisma.bookmark.findUnique({
      where: { id: bookmarkId, userId }
    })
  }

  createBookmark(userId: number, dto: CreateBookmarkDto): Promise<Bookmark> {
    return this.prisma.bookmark.create({
      data: {
        description: dto.description,
        title: dto.title,
        userId
      }
    })
  }

  updateBookmark(userId: number, bookmarkId: number, dto: UpdateBookmarkDto): Promise<Bookmark> {
    return this.prisma.bookmark.update({
      where: { id: bookmarkId, userId },
      data: { ...dto }
    })
  }

  deleteBookmark(userId: number, bookmarkId: number): Promise<Bookmark> {
    return this.prisma.bookmark.delete({
      where: { id: bookmarkId, userId }
    })
  }
}
