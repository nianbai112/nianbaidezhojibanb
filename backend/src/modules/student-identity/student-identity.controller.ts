import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../decorators/current-user.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { JwtGuard } from '../../guards/jwt.guard';
import { AdminGuard, AdminPermissionGuard } from '../../guards/admin.guard';
import { StudentIdentityService } from './student-identity.service';
import {
  EnrollmentDto,
  ReleaseStudentBindingDto,
  ReviewStudentIdentityDto,
  SchoolIdentityPolicyDto,
  StudentIdentityQuery,
} from './student-identity.dto';

@ApiTags('后台-学生名册与认证')
@ApiBearerAuth()
@Controller('admin/student-identity')
@UseGuards(JwtGuard, AdminGuard, AdminPermissionGuard)
export class StudentIdentityAdminController {
  constructor(private readonly service: StudentIdentityService) {}

  @Get('materials/:id')
  @RequirePermission('user:view')
  async material(
    @Param('id') id: string,
    @CurrentUser('sub') operator: string,
    @Res() response: Response,
  ) {
    const content = await this.service.material(id, operator, true);
    response
      .set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(content);
  }

  @Get('schools')
  @RequirePermission('user:view')
  schools(
    @CurrentUser('sub') operator: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.service.schools(operator, keyword);
  }

  @Get('applications')
  @RequirePermission('user:view')
  applications(
    @Query() query: StudentIdentityQuery,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.applications(query, operator);
  }

  @Post('applications/:userId/review')
  @RequirePermission('user:cert')
  review(
    @Param('userId') userId: string,
    @Body() dto: ReviewStudentIdentityDto,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.review(userId, dto, operator);
  }

  @Get('schools/:schoolId/roster')
  @RequirePermission('user:view')
  roster(
    @Param('schoolId') schoolId: string,
    @Query() query: StudentIdentityQuery,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.roster(schoolId, query, operator);
  }

  @Patch('schools/:schoolId/policy')
  @RequirePermission('user:cert')
  policy(
    @Param('schoolId') schoolId: string,
    @Body() dto: SchoolIdentityPolicyDto,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.policy(schoolId, dto, operator);
  }

  @Post('schools/:schoolId/import/preview')
  @RequirePermission('user:cert')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  preview(
    @Param('schoolId') schoolId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') operator: string,
  ) {
    if (!file || !/\.xlsx?$/i.test(file.originalname))
      throw new BadRequestException('请选择xls或xlsx学校名册');
    return this.service.preview(
      schoolId,
      file.buffer,
      file.originalname,
      operator,
    );
  }

  @Post('schools/:schoolId/import/:batchId/commit')
  @RequirePermission('user:cert')
  commit(
    @Param('schoolId') schoolId: string,
    @Param('batchId') batchId: string,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.commit(schoolId, batchId, operator);
  }

  @Patch('schools/:schoolId/students/:studentId/enrollment')
  @RequirePermission('user:cert')
  enrollment(
    @Param('schoolId') schoolId: string,
    @Param('studentId') studentId: string,
    @Body() dto: EnrollmentDto,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.enrollment(schoolId, studentId, dto, operator);
  }

  @Post('schools/:schoolId/students/:studentId/release')
  @RequirePermission('user:cert')
  release(
    @Param('schoolId') schoolId: string,
    @Param('studentId') studentId: string,
    @Body() dto: ReleaseStudentBindingDto,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.release(schoolId, studentId, dto, operator);
  }

  @Get('schools/:schoolId/events')
  @RequirePermission('user:view')
  events(
    @Param('schoolId') schoolId: string,
    @Query('userId') userId: string,
    @CurrentUser('sub') operator: string,
  ) {
    return this.service.events(schoolId, userId, operator);
  }
}

@ApiTags('学生认证私密材料')
@ApiBearerAuth()
@Controller('student-identity')
@UseGuards(JwtGuard)
export class StudentIdentityMaterialController {
  constructor(private readonly service: StudentIdentityService) {}

  @Post('materials')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser('sub') userId: string,
  ) {
    if (!file) throw new BadRequestException('请选择学生证照片');
    return this.service.uploadMaterial(userId, file.buffer);
  }

  @Get('materials/:id')
  async material(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Res() response: Response,
  ) {
    const content = await this.service.material(id, userId);
    response
      .set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(content);
  }
}
