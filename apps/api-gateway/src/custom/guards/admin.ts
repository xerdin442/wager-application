import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    const adminId = +request.admin.id;
    if (adminId !== 1) {
      throw new ForbiddenException(
        'Only a Super Admin is authorized to perform this operation',
      );
    }

    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, any>>();
    if (!request.admin) {
      throw new ForbiddenException(
        'Only an Admin can assign winners after dispute resolution',
      );
    }

    return true;
  }
}
