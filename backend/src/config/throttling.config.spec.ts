import "reflect-metadata";
import { ExecutionContext } from "@nestjs/common";
import {
  createThrottlerDefinitions,
  skipUnlessThrottleConfigured,
} from "./throttling.config";

describe("throttling config", () => {
  it("creates one global default limiter and opt-in specialized limiters", () => {
    const definitions = createThrottlerDefinitions({
      THROTTLE_TTL: "30",
      THROTTLE_LIMIT: "240",
      AUTH_THROTTLE_LIMIT: "9",
    } as NodeJS.ProcessEnv);

    expect(definitions[0]).toEqual(
      expect.objectContaining({ name: "default", ttl: 30000, limit: 240 }),
    );
    expect(definitions.find((item) => item.name === "auth")).toEqual(
      expect.objectContaining({ name: "auth", ttl: 30000, limit: 9 }),
    );
  });

  it("skips a named limiter unless matching decorator metadata exists", () => {
    class ControllerClass {}
    const handler = () => undefined;
    const context = {
      getHandler: () => handler,
      getClass: () => ControllerClass,
    } as unknown as ExecutionContext;
    const skip = skipUnlessThrottleConfigured("auth");

    expect(skip(context)).toBe(true);
    Reflect.defineMetadata("THROTTLER:LIMITauth", 5, handler);
    expect(skip(context)).toBe(false);
  });
});
