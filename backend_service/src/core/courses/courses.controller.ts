import {
  createCourseRequestSchema,
  type Course,
  type CourseListResponse,
  type CreateCourse,
} from '@cert/shared';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  list(): Promise<CourseListResponse> {
    return this.courses.list();
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createCourseRequestSchema)) body: CreateCourse,
  ): Promise<Course> {
    return this.courses.create(body);
  }
}
