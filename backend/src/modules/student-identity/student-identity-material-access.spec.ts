import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PHOTO_FREE_STUDENT_SCHOOL_ID } from "./student-identity.policy";
import { StudentIdentityService } from "./student-identity.service";

// Service-level regression tests use only in-memory Prisma/Redis substitutes.
// They deliberately exercise real transaction, submission, binding and response paths.
describe("StudentIdentityService private material submissions", () => {
  const applicant = "user-a";
  const request = () => ({
    school_id: "school-a",
    student_id: "S001",
    name: "张三",
    materialId: "owned-material",
  });
  const fixture = (
    options: {
      schoolId?: string;
      schoolName?: string;
      mode?: "MANUAL" | "ROSTER";
      match?: boolean;
      previous?: any;
      roster?: Record<string, any>;
    } = {},
  ) => {
    const school = {
      id: options.schoolId || "school-a",
      name: options.schoolName || "测试大学",
      regionId: "region-a",
      isEnabled: true,
      studentVerificationMode: options.mode || "MANUAL",
    };
    const roster: any = options.match
      ? {
          id: "roster-a",
          schoolId: school.id,
          studentId: "S001",
          realName: "张三",
          enrollmentStatus: "ACTIVE",
          boundUserId: null,
          version: 1,
          ...options.roster,
        }
      : null;
    const previous = options.previous || null;
    const materials: Record<string, { userId: string }> = {
      "owned-material": { userId: applicant },
      "foreign-material": { userId: "other-user" },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: applicant, status: "ACTIVE" }),
      },
      school: { findUnique: jest.fn().mockResolvedValue(school) },
      studentVerificationMaterial: {
        findUnique: jest.fn(
          async ({ where }: any) => materials[where.id] || null,
        ),
      },
      studentVerify: {
        findUnique: jest.fn().mockResolvedValue(previous),
        findUniqueOrThrow: jest.fn().mockResolvedValue(previous),
        upsert: jest.fn(async ({ create }: any) => ({
          id: "application-a",
          submissionVersion: 1,
          ...create,
          school,
          rosterStudent: roster && { ...roster, boundUserId: applicant },
        })),
      },
      schoolStudent: {
        findUnique: jest.fn().mockResolvedValue(roster),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentVerificationEvent: { create: jest.fn().mockResolvedValue({}) },
      userProfile: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn(async (work: (connection: any) => Promise<any>) =>
        work(tx),
      ),
    };
    const redis = {
      incrementWindow: jest.fn().mockResolvedValue(1),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const service = new StudentIdentityService(
      prisma as any,
      redis as any,
      {} as any,
    );
    return { service, tx, prisma, redis, school, materials };
  };
  const expectNoWrites = (tx: ReturnType<typeof fixture>["tx"]) => {
    expect(tx.studentVerify.upsert).not.toHaveBeenCalled();
    expect(tx.schoolStudent.updateMany).not.toHaveBeenCalled();
    expect(tx.studentVerificationEvent.create).not.toHaveBeenCalled();
    expect(tx.userProfile.upsert).not.toHaveBeenCalled();
  };

  it.each([false, true])(
    "designated school needs no photo and follows roster result (match=%s)",
    async (match) => {
      const f = fixture({
        schoolId: PHOTO_FREE_STUDENT_SCHOOL_ID,
        mode: "ROSTER",
        match,
      });
      const result = await f.service.submit(applicant, {
        ...request(),
        school_id: PHOTO_FREE_STUDENT_SCHOOL_ID,
        materialId: undefined,
      });
      expect(result.data).toMatchObject({
        verification_status: match ? "approved" : "pending",
        student_card_required: false,
        material_id: "",
        photo_url: "",
        major: "",
        grade: "",
        proof_method: match ? "ROSTER_MATCH" : "ROSTER_EXCEPTION",
      });
      expect(
        f.tx.studentVerificationMaterial.findUnique,
      ).not.toHaveBeenCalled();
      expect(f.tx.schoolStudent.updateMany).toHaveBeenCalledTimes(
        match ? 1 : 0,
      );
    },
  );
  it.each([
    { roster: { enrollmentStatus: "GRADUATED" } },
    { roster: { boundUserId: "other-user" } },
    { previous: { status: "REVOKED" } },
  ])(
    "exemption does not auto approve an ineligible or disputed identity %j",
    async (options) => {
      const f = fixture({
        schoolId: PHOTO_FREE_STUDENT_SCHOOL_ID,
        mode: "ROSTER",
        match: true,
        ...options,
      });
      const result = await f.service.submit(applicant, {
        ...request(),
        school_id: PHOTO_FREE_STUDENT_SCHOOL_ID,
        materialId: undefined,
      });
      expect(result.data).toMatchObject({
        verification_status: "pending",
        proof_method: "ROSTER_EXCEPTION",
      });
      expect(f.tx.schoolStudent.updateMany).not.toHaveBeenCalled();
    },
  );
  it("exemptions use stable school ID, never an untrusted school name or client flag", async () => {
    const f = fixture({ schoolName: "重庆城乡发展职业学院" });
    await expect(
      f.service.submit(applicant, {
        ...request(),
        university: "重庆城乡发展职业学院",
        student_card_required: false,
        materialId: undefined,
      } as any),
    ).rejects.toThrow("重新上传本人学生证照片");
    expectNoWrites(f.tx);
  });
  it("exempt school still rejects another user's supplied material before writes", async () => {
    const f = fixture({
      schoolId: PHOTO_FREE_STUDENT_SCHOOL_ID,
      mode: "ROSTER",
      match: true,
    });
    await expect(
      f.service.submit(applicant, {
        ...request(),
        school_id: PHOTO_FREE_STUDENT_SCHOOL_ID,
        materialId: "foreign-material",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoWrites(f.tx);
  });

  const branches = [
    { label: "manual review", mode: "MANUAL" as const },
    { label: "roster exception", mode: "ROSTER" as const, match: false },
    { label: "roster auto approval", mode: "ROSTER" as const, match: true },
  ];
  describe.each(branches)("$label", (options) => {
    it("rejects another account material before any identity or audit write", async () => {
      const f = fixture(options);
      await expect(
        f.service.submit(applicant, {
          ...request(),
          materialId: "foreign-material",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectNoWrites(f.tx);
      expect(f.redis.delPattern).not.toHaveBeenCalled();
    });

    it("rejects a missing or deleted material even if a valid public URL accompanies it", async () => {
      const f = fixture(options);
      await expect(
        f.service.submit(applicant, {
          ...request(),
          materialId: "missing-material",
        }),
      ).rejects.toThrow("认证材料不存在或已失效");
      await expect(
        f.service.submit(applicant, {
          ...request(),
          materialId: "missing-material",
          photo_url: "https://public.example/student.jpg",
        }),
      ).rejects.toThrow("不再接受公开学生证链接");
      expectNoWrites(f.tx);
    });

    it.each(["photo_url", "cardImage"])(
      "rejects new public material through %s, including alongside owned material",
      async (field) => {
        const f = fixture(options);
        await expect(
          f.service.submit(applicant, {
            ...request(),
            [field]: "https://public.example/student.jpg",
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
          f.service.submit(applicant, {
            ...request(),
            materialId: undefined,
            [field]: "https://public.example/student.jpg",
          }),
        ).rejects.toThrow("不再接受公开学生证链接");
        expectNoWrites(f.tx);
      },
    );
  });

  it("requires privately uploaded material for a manual application", async () => {
    const f = fixture();
    await expect(
      f.service.submit(applicant, { ...request(), materialId: undefined }),
    ).rejects.toThrow("重新上传本人学生证照片");
    expectNoWrites(f.tx);
  });

  it("accepts owned material for manual review and stores no public card image", async () => {
    const f = fixture();
    const result = await f.service.submit(applicant, {
      ...request(),
      materialId: " owned-material ",
      photo_url: "",
      cardImage: " ",
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        verification_status: "pending",
        material_id: "owned-material",
        photo_url: "",
      },
    });
    expect(f.tx.studentVerify.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: applicant,
          materialId: "owned-material",
          cardImage: null,
        }),
        update: expect.objectContaining({
          materialId: "owned-material",
          cardImage: null,
        }),
      }),
    );
    expect(f.tx.studentVerificationMaterial.findUnique).toHaveBeenCalledWith({
      where: { id: "owned-material" },
      select: { userId: true },
    });
  });

  it("still auto approves matching active roster identity without requiring a photo", async () => {
    const f = fixture({ mode: "ROSTER", match: true });
    const result = await f.service.submit(applicant, {
      ...request(),
      materialId: undefined,
    });
    expect(result).toMatchObject({
      success: true,
      data: {
        verification_status: "approved",
        proof_method: "ROSTER_MATCH",
        material_id: "",
        photo_url: "",
      },
    });
    expect(f.tx.studentVerificationMaterial.findUnique).not.toHaveBeenCalled();
    expect(f.tx.schoolStudent.updateMany).toHaveBeenCalledTimes(1);
  });

  it("validates an optional owned material before roster auto approval, then stores no unnecessary photo", async () => {
    const f = fixture({ mode: "ROSTER", match: true });
    const result = await f.service.submit(applicant, request());
    expect(result.data).toMatchObject({
      verification_status: "approved",
      material_id: "",
      photo_url: "",
    });
    expect(f.tx.studentVerificationMaterial.findUnique).toHaveBeenCalledTimes(
      1,
    );
    expect(f.tx.studentVerify.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ materialId: null, cardImage: null }),
      }),
    );
  });

  it.each([
    { label: "no match", match: false },
    {
      label: "inactive enrollment",
      match: true,
      roster: { enrollmentStatus: "GRADUATED" },
    },
    {
      label: "bound to another account",
      match: true,
      roster: { boundUserId: "other-user" },
    },
    {
      label: "revoked application",
      match: true,
      previous: { status: "REVOKED" },
    },
  ])(
    "requests material for $label without creating or approving an application",
    async (options) => {
      const f = fixture({ mode: "ROSTER", ...options });
      const result = await f.service.submit(applicant, {
        ...request(),
        materialId: undefined,
      });
      expect(result).toMatchObject({
        success: true,
        data: { requires_material: true },
      });
      expectNoWrites(f.tx);
    },
  );

  it("lets an unmatched roster application use owned material for manual review", async () => {
    const f = fixture({ mode: "ROSTER", match: false });
    const result = await f.service.submit(applicant, request());
    expect(result.data).toMatchObject({
      verification_status: "pending",
      proof_method: "ROSTER_EXCEPTION",
      material_id: "owned-material",
    });
    expect(f.tx.schoolStudent.updateMany).not.toHaveBeenCalled();
  });

  it("rejects malformed private material IDs and nonblank legacy aliases independently", async () => {
    const f = fixture({ mode: "ROSTER", match: true });
    await expect(
      f.service.submit(applicant, { ...request(), materialId: " \n " }),
    ).rejects.toThrow("认证材料编号");
    await expect(
      f.service.submit(applicant, {
        ...request(),
        photo_url: " ",
        cardImage: "https://public.example/student.jpg",
      }),
    ).rejects.toThrow("不再接受公开学生证链接");
    expectNoWrites(f.tx);
  });

  it("keeps historical public material readable without rewriting existing records", async () => {
    const previous = {
      id: "legacy-application",
      userId: applicant,
      status: "PENDING",
      proofMethod: "LEGACY",
      schoolId: "school-a",
      schoolName: "测试大学",
      studentId: "S001",
      realName: "张三",
      cardImage: "https://legacy.example/card.jpg",
      materialId: null,
    };
    const f = fixture({ previous });
    const result = await f.service.me(applicant);
    expect(result.data).toMatchObject({
      photo_url: previous.cardImage,
      verification_status: "pending",
    });
    expectNoWrites(f.tx);
    await expect(
      f.service.submit(applicant, {
        ...request(),
        materialId: undefined,
        photo_url: previous.cardImage,
      }),
    ).rejects.toThrow("不再接受公开学生证链接");
    expect(previous.cardImage).toBe("https://legacy.example/card.jpg");
    expectNoWrites(f.tx);
  });

  it("archives the old public material and replaces it with owned private material only on an explicit resubmission", async () => {
    const previous = {
      id: "legacy-application",
      userId: applicant,
      status: "REJECTED",
      proofMethod: "LEGACY",
      submissionVersion: 1,
      schoolId: "school-a",
      schoolName: "测试大学",
      studentId: "S001",
      realName: "张三",
      cardImage: "https://legacy.example/card.jpg",
      materialId: null,
    };
    const f = fixture({ previous });
    await f.service.submit(applicant, request());
    expect(f.tx.studentVerificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ARCHIVE_SUBMISSION",
        detail: expect.objectContaining({ legacyImage: previous.cardImage }),
      }),
    });
    expect(f.tx.studentVerify.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          cardImage: null,
          materialId: "owned-material",
        }),
      }),
    );
  });

  it("preserves an approved identical identity as an idempotent read, ignoring new unused material fields", async () => {
    const previous = {
      id: "approved-application",
      userId: applicant,
      status: "APPROVED",
      proofMethod: "LEGACY",
      schoolId: "school-a",
      studentId: "S001",
      realName: "张三",
      school: { id: "school-a", regionId: "region-a", isEnabled: true },
      cardImage: "https://legacy.example/card.jpg",
      materialId: null,
    };
    const f = fixture({ previous });
    const result = await f.service.submit(applicant, {
      ...request(),
      photo_url: previous.cardImage,
      materialId: "foreign-material",
    });
    expect(result.data).toMatchObject({
      verification_status: "approved",
      photo_url: previous.cardImage,
      material_id: "",
    });
    expectNoWrites(f.tx);
    expect(f.tx.studentVerificationMaterial.findUnique).not.toHaveBeenCalled();
    await expect(
      f.service.submit(applicant, { ...request(), student_id: "DIFFERENT" }),
    ).rejects.toThrow("身份变更请联系学校核实");
  });
});
