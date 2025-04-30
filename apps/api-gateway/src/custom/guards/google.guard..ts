import { Injectable, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly GOOGLE_REDIRECT_COOKIE_KEY: string =
    'google_auth_redirect_url';

  constructor(private readonly config: ConfigService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Store client redirect URL before Google invokes the callback
    const redirectUrl = req.query.redirectUrl as string;
    if (redirectUrl) {
      res.cookie(this.GOOGLE_REDIRECT_COOKIE_KEY, redirectUrl, {
        httpOnly: true,
        secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
        sameSite: 'lax',
        maxAge: 20 * 60 * 1000,
      });
    }

    // Trigger the Google strategy and populate the req.user object if validation is successful
    const activate = await super.canActivate(context);

    return activate as boolean;
  }
}
