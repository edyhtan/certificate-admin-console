import {
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { z } from 'zod';
import {
  ValidationFailedError,
  type FieldErrors,
} from '../errors/app-error.js';

/**
 * Validates and parses one handler input with a zod schema, e.g.
 * `@Body(new ZodValidationPipe(createCourseSchema)) body: CreateCourse`.
 * Failures become `400 validation_failed` with one message per field.
 */
@Injectable()
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<S>
> {
  constructor(private readonly schema: S) {}

  transform(value: unknown, metadata: ArgumentMetadata): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: FieldErrors = {};
    for (const issue of result.error.issues) {
      const key =
        issue.path.length > 0 ? issue.path.map(String).join('.') : metadata.type;
      // Keep the first message per field: it is usually the most basic problem.
      fields[key] ??= issue.message;
    }
    throw new ValidationFailedError(fields);
  }
}
