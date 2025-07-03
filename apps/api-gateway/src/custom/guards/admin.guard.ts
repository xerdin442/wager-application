import { DbService } from '@app/db';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;
    const admin = await this.prisma.admin.findUnique({
      where: { email: request.query.email as string },
    });

    if (!admin || admin.id !== 1) {
      throw new UnauthorizedException(
        'Only the Super Admin is authorized to perform this operation',
      );
    }

    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: DbService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;

    const admin = await this.prisma.admin.findUnique({
      where: { email: request.query.admin as string },
    });

    if (!admin) {
      throw new UnauthorizedException(
        'Only an Admin can perform this operation',
      );
    }

    return true;
  }
}
