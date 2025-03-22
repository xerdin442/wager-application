import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    delete request.user.password;
    delete request.user.ethPrivateKey;
    return request.user;
  },
);

export const GetAdmin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    delete request.admin.passcode;
    return request.admin;
  },
);
