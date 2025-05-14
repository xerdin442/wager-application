import { DbService } from '@app/db';
import { UtilsService } from '@app/utils';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-twitter';
import { selectCallbackUrl } from '../utils';
import { lastValueFrom, catchError } from 'rxjs';
import { handleError } from '../../utils/error';
import { LoginDTO } from '../dto';
import { SocialAuthUser, SocialAuthPayload } from '../types';

@Injectable()
export class TwitterStrategy extends PassportStrategy(Strategy) {
  private readonly context: string = TwitterStrategy.name;

  constructor(
    private readonly utils: UtilsService,
    private readonly prisma: DbService,
    @Inject('AUTH_SERVICE') private readonly natsClient: ClientProxy,
  ) {
    super({
      consumerKey: process.env.TWITTER_CONSUMER_KEY as string,
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET as string,
      callbackURL: selectCallbackUrl('twitter'),
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    token: string,
    tokenSecret: string,
    profile: Profile,
    done: (err: any, user?: any) => void,
  ): Promise<void> {
    const { emails, name, photos, username } = profile;
    if (!emails || !name || !username) {
      return done(
        new UnauthorizedException('Twitter authentication failed'),
        undefined,
      );
    }

    try {
      // Check if user exists with the retrieved email address
      const user = await this.prisma.user.findUnique({
        where: { email: emails[0].value },
      });

      if (user) {
        const dto: LoginDTO = { ...user };

        // Sign in existing user
        const authResponse = await lastValueFrom(
          this.natsClient
            .send<SocialAuthUser>('login', { dto })
            .pipe(catchError(handleError)),
        );

        return done(null, authResponse);
      } else {
        const details: SocialAuthPayload = {
          email: emails[0].value,
          firstName: name.givenName,
          lastName: name.familyName,
          profileImage: photos ? photos[0].value : '',
          username,
        };

        // Sign up and onboard new user
        const authResponse = await lastValueFrom(
          this.natsClient
            .send<SocialAuthUser>('signup', { details })
            .pipe(catchError(handleError)),
        );

        return done(null, authResponse);
      }
    } catch (error) {
      this.utils
        .logger()
        .error(
          `[${this.context}] An error occurred while validating Twitter authentication strategy. Error: ${error.message}\n`,
        );

      if (error instanceof RpcException) return done(error, undefined);
      throw error;
    }
  }
}
