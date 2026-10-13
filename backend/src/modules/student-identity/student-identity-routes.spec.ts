import { INestApplication, UnauthorizedException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { StudentIdentityMaterialController } from "./student-identity.controller";
import { StudentIdentityService } from "./student-identity.service";
import { JwtGuard } from "../../guards/jwt.guard";
import { TransformInterceptor } from "../../interceptors/transform.interceptor";
import {
  getMiniProgramGlobalPrefixExcludes,
  miniProgramApiCompatMiddleware,
} from "../../common/middleware/mini-program-api-compat";

describe("student proof routes behind the mini-program API proxy", () => {
  let app: INestApplication;
  const proof = Buffer.from("synthetic-student-proof");
  const service = {
    uploadMaterial: jest.fn(async () => ({
      success: true,
      data: { materialId: "material-a" },
    })),
    material: jest.fn(async () => proof),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudentIdentityMaterialController],
      providers: [{ provide: StudentIdentityService, useValue: service }],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate(context: any) {
          const req = context.switchToHttp().getRequest();
          if (req.headers.authorization !== "Bearer test-student")
            throw new UnauthorizedException("请先登录");
          req.user = { sub: "user-a" };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.use(miniProgramApiCompatMiddleware);
    app.useGlobalInterceptors(new TransformInterceptor());
    app.setGlobalPrefix("/api/v1", {
      exclude: [...getMiniProgramGlobalPrefixExcludes(), "api/{*path}"],
    });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  // Nginx removes /api; direct connections retain it. Both must reach the controller.
  describe.each([
    "/student-identity/materials",
    "/api/student-identity/materials",
  ])("%s", (url) => {
    it("routes a logged-in multipart upload to private proof storage", async () => {
      const response = await request(app.getHttpServer())
        .post(url)
        .set("Authorization", "Bearer test-student")
        .attach("file", proof, {
          filename: "student.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
      expect(response.body.data.data.materialId).toBe("material-a");
      expect(service.uploadMaterial).toHaveBeenLastCalledWith("user-a", proof);
    });

    it("routes authenticated proof preview with private cache headers", async () => {
      const response = await request(app.getHttpServer())
        .get(`${url}/material-a`)
        .set("Authorization", "Bearer test-student")
        .expect(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body).toEqual(proof);
      expect(service.material).toHaveBeenLastCalledWith("material-a", "user-a");
    });

    it("requires login for both upload and preview", async () => {
      await request(app.getHttpServer()).post(url).expect(401);
      await request(app.getHttpServer()).get(`${url}/material-a`).expect(401);
    });

    it("reports missing file as a validation error, not a missing route", async () => {
      await request(app.getHttpServer())
        .post(url)
        .set("Authorization", "Bearer test-student")
        .expect(400);
    });
  });
});
