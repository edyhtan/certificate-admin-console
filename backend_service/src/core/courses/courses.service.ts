import type {
  Course,
  CourseListResponse,
  CreateCourse,
} from '@cert/shared';
import { Injectable } from '@nestjs/common';
import { AppContext } from '../context/app-context.js';

const COURSE_FIELDS = { id: true, code: true, title: true } as const;

@Injectable()
export class CoursesService {
  constructor(private readonly ctx: AppContext) {}

  /** All courses, by title (spec §5.6). */
  async list(): Promise<CourseListResponse> {
    const items = await this.ctx.db.course.findMany({
      select: COURSE_FIELDS,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return { items };
  }

  /**
   * Input is already trimmed and upper-cased by the contract schema. A duplicate code is
   * decided by the unique index (P2002 → 409 naming `code`), not by a check first.
   */
  async create(input: CreateCourse): Promise<Course> {
    return this.ctx.db.course.create({
      data: { code: input.code, title: input.title },
      select: COURSE_FIELDS,
    });
  }
}
