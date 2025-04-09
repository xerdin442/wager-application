import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Admin, User } from '@prisma/client';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Record<string, any>>();

    delete request.user.password;
    delete request.user.ethPrivateKey;
    delete request.user.solPrivateKey;
    return request.user as User;
  },
);

export const GetAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Record<string, any>>();

    delete request.admin.passcode;
    return request.admin as Admin;
  },
);
