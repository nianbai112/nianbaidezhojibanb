import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { HealthModule } from "../src/modules/health/health.module";

describe("HealthController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /healthz reports an operational process", async () => {
    const response = await request(app.getHttpServer())
      .get("/healthz")
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: "ok",
        timestamp: expect.any(String),
      }),
    );
  });
});
