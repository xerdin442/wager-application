import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';

export const handleError = (error: any): Observable<never> => {
  const status = error?.status as number | undefined;
  const message = error?.message as string | undefined;

  if (status === 400) {
    return throwError(() => new BadRequestException(message));
  } else if (status === 401) {
    return throwError(() => new UnauthorizedException(message));
  } else if (status === 403) {
    return throwError(() => new ForbiddenException(message));
  } else {
    return throwError(() => new InternalServerErrorException(message));
  }
};
