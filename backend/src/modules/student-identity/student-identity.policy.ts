import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

// 重庆城乡发展职业学院：名册优先，未匹配转人工审核，无须照片。
export const PHOTO_FREE_STUDENT_SCHOOL_ID = 'cmt75us9v00y8xlf0x6bu0mdo';
export const requiresStudentCard = (schoolId?: string | null) =>
  schoolId !== PHOTO_FREE_STUDENT_SCHOOL_ID;

export const STUDENT_IDENTIFIER_MAX = 191;
export const identityKey = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export function studentText(
  value: unknown,
  label: string,
  max = STUDENT_IDENTIFIER_MAX,
): string {
  if (typeof value !== 'string')
    throw new BadRequestException(`${label}必须为文本`);
  const text = value.trim();
  const controls = [...text].some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
  if (!text || text.length > max || controls) {
    throw new BadRequestException(
      `${label}不能为空、含控制字符或超过${max}字符`,
    );
  }
  return text;
}

export const identityInclude = {
  school: {
    select: {
      id: true,
      name: true,
      regionId: true,
      isEnabled: true,
      studentVerificationMode: true,
    },
  },
  rosterStudent: {
    select: {
      id: true,
      schoolId: true,
      enrollmentStatus: true,
      boundUserId: true,
    },
  },
} as const;

/** A profile region and an APPROVED flag alone are not school membership. */
export function effectiveStudentIdentity(
  record: any,
  userId: string,
  regionId?: string | null,
): boolean {
  if (
    record?.status !== 'APPROVED' ||
    !record.schoolId ||
    !record.school?.isEnabled
  )
    return false;
  if (record.school.id !== record.schoolId || !record.school.regionId)
    return false;
  if (regionId && record.school.regionId !== regionId) return false;
  if (record.rosterStudentId) {
    const student = record.rosterStudent;
    return (
      !!student &&
      student.id === record.rosterStudentId &&
      student.schoolId === record.schoolId &&
      student.enrollmentStatus === 'ACTIVE' &&
      student.boundUserId === userId
    );
  }
  return ['LEGACY', 'MANUAL_REVIEW', 'SCHOOL_EXCEPTION'].includes(
    record.proofMethod,
  );
}

export function miniStudentIdentity(record: any) {
  if (!record) return null;
  const effective = effectiveStudentIdentity(record, record.userId);
  const status =
    record.status === 'APPROVED' && !effective
      ? 'revoked'
      : record.status.toLowerCase();
  return {
    id: record.id,
    student_id: record.studentId,
    name: record.realName,
    university: record.schoolName,
    school_id: record.schoolId || '',
    schoolId: record.schoolId || '',
    school_region_id: record.school?.regionId || '',
    school_name: record.school?.name || record.schoolName,
    major: record.major || '',
    grade: record.grade || '',
    photo_url: record.materialId ? '' : record.cardImage || '',
    material_id: record.materialId || '',
    verification_status: status,
    rejection_reason: record.remark || '',
    verification_mode: record.school?.studentVerificationMode || 'MANUAL',
    student_card_required: requiresStudentCard(record.schoolId),
    proof_method: record.proofMethod,
    manual_review_required: record.status === 'PENDING',
    submission_version: record.submissionVersion,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    verified_at: record.verifiedAt,
  };
}
