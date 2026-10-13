import { PHOTO_FREE_STUDENT_SCHOOL_ID } from "./student-identity.policy";
import { StudentIdentityService } from "./student-identity.service";

// Exercise the real review -> reject -> resubmit -> review lifecycle without a live database.
describe("student identity rejection and resubmission", () => {
  function fixture(legacy = false, photoFree = false) {
    const school = {
      id: photoFree ? PHOTO_FREE_STUDENT_SCHOOL_ID : "school-a",
      name: "测试大学",
      regionId: "region-a",
      isEnabled: true,
      studentVerificationMode: photoFree ? "ROSTER" : "MANUAL",
    };
    let record: any = {
      id: "application-a",
      userId: "user-a",
      schoolId: school.id,
      schoolName: school.name,
      realName: "原姓名",
      studentId: "001Ab-26",
      major: "计算机",
      grade: "2026级",
      status: "PENDING",
      submissionVersion: 1,
      materialId: legacy ? null : "material-old",
      cardImage: legacy ? "https://legacy.invalid/card.jpg" : null,
      rosterStudentId: null,
      proofMethod: "MANUAL_PENDING",
      remark: null,
      verifiedAt: null,
    };
    const events: any[] = [];
    const read = async () => ({ ...record, school });
    const write = (data: any) => {
      const { submissionVersion, ...fields } = data;
      record = {
        ...record,
        ...fields,
        submissionVersion:
          record.submissionVersion + (submissionVersion?.increment || 0),
      };
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
      school: { findUnique: jest.fn().mockResolvedValue(school) },
      studentVerify: {
        findUnique: jest.fn(read),
        findUniqueOrThrow: jest.fn(read),
        upsert: jest.fn(async ({ update }: any) => {
          write(update);
          return read();
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (
            where.id !== record.id ||
            where.submissionVersion !== record.submissionVersion ||
            where.status !== record.status
          )
            return { count: 0 };
          write(data);
          return { count: 1 };
        }),
      },
      schoolStudent: { findUnique: jest.fn().mockResolvedValue(null) },
      studentVerificationMaterial: {
        findUnique: jest.fn(async ({ where }: any) => ({
          userId: where.id === "foreign-material" ? "other-user" : "user-a",
        })),
      },
      studentVerificationEvent: {
        create: jest.fn(async ({ data }: any) => {
          events.push(data);
          return data;
        }),
      },
      userProfile: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (work: any) => work(tx)),
    };
    const redis = {
      incrementWindow: jest.fn().mockResolvedValue(1),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const scope = {
      getAdminContext: jest
        .fn()
        .mockResolvedValue({ isSuperAdmin: false, regionIds: ["region-a"] }),
    };
    const service = new StudentIdentityService(
      prisma as any,
      redis as any,
      scope as any,
    );
    const decision = (version: number, status: "approved" | "rejected") => ({
      applicationId: record.id,
      submissionVersion: version,
      status,
      ...(status === "rejected" ? { reason: "姓名和证件不一致" } : {}),
    });
    const submit = () =>
      service.submit("user-a", {
        school_id: school.id,
        student_id: "001Ab-26",
        name: "更正姓名",
        major: "计算机",
        grade: "2026级",
        materialId: photoFree ? undefined : "material-new",
      });
    return {
      service,
      tx,
      redis,
      events,
      decision,
      submit,
      record: () => record,
    };
  }

  it("designated school supports reject, photo-free resubmit and scoped manual approval while archiving old evidence", async () => {
    const f = fixture(true, true);
    await f.service.review("user-a", f.decision(1, "rejected"), "admin-a");
    const result = await f.submit();
    expect(result.data).toMatchObject({
      verification_status: "pending",
      student_card_required: false,
      material_id: "",
      photo_url: "",
      submission_version: 3,
    });
    expect(
      f.events.find((event) => event.action === "ARCHIVE_SUBMISSION"),
    ).toMatchObject({
      detail: { legacyImage: "https://legacy.invalid/card.jpg" },
    });
    const approved = await f.service.review(
      "user-a",
      f.decision(3, "approved"),
      "admin-a",
    );
    expect(approved.data).toMatchObject({
      verification_status: "approved",
      proof_method: "SCHOOL_EXCEPTION",
      submission_version: 4,
    });
  });
  it("other schools still cannot approve an application without proof", async () => {
    const f = fixture();
    f.record().materialId = null;
    await expect(
      f.service.review("user-a", f.decision(1, "approved"), "admin-a"),
    ).rejects.toThrow("人工审核需要学生提交的证明材料");
    expect(f.record().status).toBe("PENDING");
  });

  it.each([false, true])(
    "rejected application can be corrected and approved, preserving old proof (legacy=%s)",
    async (legacy) => {
      const f = fixture(legacy);
      const rejected = await f.service.review(
        "user-a",
        f.decision(1, "rejected"),
        "admin-a",
      );
      expect(rejected.data).toMatchObject({
        verification_status: "rejected",
        submission_version: 2,
      });
      const submitted = await f.submit();
      expect(submitted.data).toMatchObject({
        id: "application-a",
        verification_status: "pending",
        submission_version: 3,
        name: "更正姓名",
        material_id: "material-new",
        rejection_reason: "",
        photo_url: "",
      });
      expect(f.record()).toMatchObject({
        remark: null,
        verifiedAt: null,
        cardImage: null,
      });
      expect(
        f.events.find((event) => event.action === "ARCHIVE_SUBMISSION"),
      ).toMatchObject({
        submissionVersion: 2,
        materialId: legacy ? null : "material-old",
        detail: {
          status: "REJECTED",
          reason: "姓名和证件不一致",
          realName: "原姓名",
        },
      });
      // An administrator with the old rejected version must reload the new material.
      await expect(
        f.service.review("user-a", f.decision(2, "approved"), "admin-a"),
      ).rejects.toThrow("申请已更新");
      expect(f.record().status).toBe("PENDING");
      const approved = await f.service.review(
        "user-a",
        f.decision(3, "approved"),
        "admin-a",
      );
      expect(approved.data).toMatchObject({
        verification_status: "approved",
        submission_version: 4,
        name: "更正姓名",
      });
      expect(f.redis.delPattern).toHaveBeenCalledWith("user:profile:user-a:*");
      expect(f.redis.delPattern).toHaveBeenCalledWith(
        "user:profile:v2:user-a:*",
      );
    },
  );

  it("another account material cannot replace a rejected application or its history", async () => {
    const f = fixture();
    await f.service.review("user-a", f.decision(1, "rejected"), "admin-a");
    const before = { ...f.record() },
      eventsBefore = f.events.length;
    await expect(
      f.service.submit("user-a", {
        school_id: "school-a",
        student_id: "001Ab-26",
        name: "更正姓名",
        materialId: "foreign-material",
      }),
    ).rejects.toThrow("只能使用本人上传");
    expect(f.record()).toEqual(before);
    expect(f.events).toHaveLength(eventsBefore);
  });
});
