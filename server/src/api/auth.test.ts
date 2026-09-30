import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../core/config.js";
import { createApi } from "./api.js";
import { openDatabase, type Db } from "../core/db.js";
import {
  extractRequestToken,
  isExternallyReachableHost,
  isGuardedApiPath,
  tokensMatch,
} from "./auth.js";

const baseEnv = {
  DISCORD_TOKEN: "fake",
  DISCORD_CLIENT_ID: "client",
  TRACKED_GUILD_ID: "guild",
  TRACKED_CHANNEL_IDS: "chan-1",
  DATABASE_PATH: ":memory:",
  SKIP_DISCORD_LOGIN: "true",
  NODE_ENV: "test",
};

let db: Db | undefined;
afterEach(() => db?.close());

describe("api auth helpers", () => {
  it("guards /api routes except the health probe", () => {
    expect(isGuardedApiPath("/api/daily")).toBe(true);
    expect(isGuardedApiPath("/api/events/stream")).toBe(true);
    expect(isGuardedApiPath("/api/health")).toBe(false);
    expect(isGuardedApiPath("/index.html")).toBe(false);
    expect(isGuardedApiPath("/")).toBe(false);
  });

  it("reads the token from a bearer header, x-api-token, or the SSE query param", () => {
    expect(extractRequestToken({ authorization: "Bearer abc" }, {})).toBe("abc");
    expect(extractRequestToken({ authorization: "bearer  abc " }, {})).toBe(
      "abc",
    );
    expect(extractRequestToken({ "x-api-token": "abc" }, {})).toBe("abc");
    expect(extractRequestToken({}, { token: "abc" })).toBe("abc");
    expect(extractRequestToken({}, {})).toBeNull();
    expect(extractRequestToken({ authorization: "Basic abc" }, {})).toBeNull();
  });

  it("compares tokens without throwing on a length mismatch", () => {
    expect(tokensMatch("secret", "secret")).toBe(true);
    expect(tokensMatch("secret", "secre")).toBe(false);
    expect(tokensMatch("secret", "wrong!")).toBe(false);
    expect(tokensMatch("secret", null)).toBe(false);
  });

  it("treats only loopback binds as local", () => {
    expect(isExternallyReachableHost("127.0.0.1")).toBe(false);
    expect(isExternallyReachableHost("localhost")).toBe(false);
    expect(isExternallyReachableHost("::1")).toBe(false);
    expect(isExternallyReachableHost("0.0.0.0")).toBe(true);
    expect(isExternallyReachableHost("192.168.1.10")).toBe(true);
  });
});

describe("API auth enforcement", () => {
  it("leaves every route open when no token is configured", async () => {
    const config = loadConfig(baseEnv);
    db = openDatabase(":memory:");
    const api = createApi({ config, discordStatus: () => "skipped", db });

    const daily = await api.app.inject({ method: "GET", url: "/api/daily" });
    expect(daily.statusCode).toBe(200);
    expect(
      (await api.app.inject({ method: "GET", url: "/api/config/boundaries" }))
        .json(),
    ).toMatchObject({ authRequired: false });
    await api.close();
  });

  it("rejects unauthenticated API calls once a token is configured", async () => {
    const config = loadConfig({ ...baseEnv, API_AUTH_TOKEN: "s3cret-token" });
    db = openDatabase(":memory:");
    const api = createApi({ config, discordStatus: () => "skipped", db });

    const anonymous = await api.app.inject({ method: "GET", url: "/api/daily" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toMatchObject({ error: "unauthorized" });

    const wrong = await api.app.inject({
      method: "GET",
      url: "/api/daily",
      headers: { authorization: "Bearer nope" },
    });
    expect(wrong.statusCode).toBe(401);

    const write = await api.app.inject({
      method: "POST",
      url: "/api/main-quests",
      payload: { title: "Injected", difficulty: "hard" },
    });
    expect(write.statusCode).toBe(401);

    await api.close();
  });

  it("accepts a valid token from a header or the SSE query param, and keeps health open", async () => {
    const config = loadConfig({ ...baseEnv, API_AUTH_TOKEN: "s3cret-token" });
    db = openDatabase(":memory:");
    const api = createApi({ config, discordStatus: () => "skipped", db });

    const health = await api.app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);

    const bearer = await api.app.inject({
      method: "GET",
      url: "/api/daily",
      headers: { authorization: "Bearer s3cret-token" },
    });
    expect(bearer.statusCode).toBe(200);

    const headerToken = await api.app.inject({
      method: "GET",
      url: "/api/stats/player",
      headers: { "x-api-token": "s3cret-token" },
    });
    expect(headerToken.statusCode).toBe(200);

    const queryToken = await api.app.inject({
      method: "GET",
      url: "/api/notifications?token=s3cret-token",
    });
    expect(queryToken.statusCode).toBe(200);

    const boundaries = await api.app.inject({
      method: "GET",
      url: "/api/config/boundaries",
      headers: { authorization: "Bearer s3cret-token" },
    });
    expect(boundaries.json()).toMatchObject({ authRequired: true });

    await api.close();
  });

  it("ignores an unfilled .env.example placeholder token", async () => {
    const config = loadConfig({
      ...baseEnv,
      API_AUTH_TOKEN: "replace_with_a_long_random_string",
    });
    expect(config.apiAuthToken).toBeNull();
  });
});

describe("list route limits", () => {
  it("clamps and rejects out-of-range limits instead of binding them into SQL", async () => {
    const config = loadConfig(baseEnv);
    db = openDatabase(":memory:");
    const api = createApi({ config, discordStatus: () => "skipped", db });

    // Non-numeric and over-max values fall back to the safe default rather than reaching SQLite.
    for (const url of [
      "/api/timeline?limit=abc",
      "/api/timeline?limit=-5",
      "/api/timeline?limit=100000",
      "/api/notifications?limit=abc",
      "/api/notifications?limit=0",
    ]) {
      const response = await api.app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(200);
    }

    await api.close();
  });
});
