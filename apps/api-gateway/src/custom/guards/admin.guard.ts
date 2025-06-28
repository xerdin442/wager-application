import { DbService } from '@app/db';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;
    const adminId = +request.user.id;

    if (adminId !== 1) {
      throw new ForbiddenException(
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
      where: { email: request.user.email as string },
    });

    if (!admin) {
      throw new ForbiddenException('Only an Admin can perform this operation');
    }

    return true;
  }
}
