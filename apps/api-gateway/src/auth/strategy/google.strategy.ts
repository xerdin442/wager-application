import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { selectGoogleCallbackUrl } from '../utils';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { catchError, lastValueFrom } from 'rxjs';
import { handleError } from '../../utils/error';
import { GoogleAuthPayload, GoogleAuthUser } from '../types';
import { UtilsService } from '@app/utils';
import { JwtService } from '@nestjs/jwt';
import { DbService } from '@app/db';
import { Request } from 'express';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy) {
  private readonly context: string = GoogleStrategy.name;

  constructor(
    private readonly utils: UtilsService,
    private readonly jwt: JwtService,
    private readonly prisma: DbService,
    @Inject('AUTH_SERVICE') private readonly natsClient: ClientProxy,
  ) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: selectGoogleCallbackUrl(),
      passReqToCallback: true,
      scope: ['profile', 'email'],
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { emails, name, photos } = profile;
    if (!emails || !name) {
      return done(
        new UnauthorizedException('Google authentication failed'),
        undefined,
      );
    }

    try {
      // Check if user exists with the retrieved email address
      const user = await this.prisma.user.findUnique({
        where: { email: emails[0].value },
      });

      if (user) {
        // Create and sign JWT payload if user exists
        const payload = { sub: user.id, email: user.email };
        const authenticatedUser: GoogleAuthUser = {
          twoFactorAuth: user.twoFAEnabled,
          token: await this.jwt.signAsync(payload),
        };

        done(null, authenticatedUser);

        this.utils
          .logger()
          .info(
            `[${this.context}] User login successful. Email: ${user.email}\n`,
          );

        return;
      } else {
        const details: GoogleAuthPayload = {
          email: emails[0].value,
          firstName: name.givenName,
          lastName: name.familyName,
          profileImage: photos ? photos[0].value : '',
        };

        // Create and onboard new user
        const authResponse = await lastValueFrom(
          this.natsClient
            .send<GoogleAuthUser>('google-auth', { details })
            .pipe(catchError(handleError)),
        );

        return done(null, authResponse);
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while validating Google authentication strategy. Error: ${error.message}\n`,
        );

      if (error instanceof RpcException) return done(error, undefined);
      throw error;
    }
  }
}
