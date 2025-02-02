import {
  CanActivate,
  ExecutionContext,
  Injectable
} from "@nestjs/common";

@Injectable()
export class CustomGuard implements CanActivate {
  constructor() { };

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return true;
  }
}