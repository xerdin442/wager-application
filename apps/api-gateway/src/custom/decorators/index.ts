import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Admin, User } from '@prisma/client';
import { Request } from 'express';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;

    request.user.password = '';
    return request.user as User;
  },
);

export const GetAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>() as Record<
      string,
      any
    >;

    request.user.passcode = '';
    return request.user as Admin;
  },
);
