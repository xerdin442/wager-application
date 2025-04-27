import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Trigger the Google strategy and populate the req.user object if validation is successful
    const activate = await super.canActivate(context);

    return activate as boolean;
  }
}
