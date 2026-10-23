import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { from, switchMap, type Observable } from 'rxjs';
import { SingleTenantAppContext } from './single-tenant-app-context.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Before each write, loads the `admin` row if it isn't loaded yet, for example when the API
 * started before the database was up or seeded. Writes then recover without a restart (D60).
 * Reads don't use the actor, so they skip it.
 */
@Injectable()
export class LoadActorInterceptor implements NestInterceptor {
  constructor(private readonly ctx: SingleTenantAppContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const { method } = context.switchToHttp().getRequest<{ method: string }>();
    if (!WRITE_METHODS.has(method)) return next.handle();
    return from(this.ctx.ensureActor()).pipe(switchMap(() => next.handle()));
  }
}
