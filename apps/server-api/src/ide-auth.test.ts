import { describe, expect, it } from "vitest";
import {
  createIdeAuthService,
  parseIdeAuthState,
  type IdeAuthState,
} from "./ide-auth";

describe("IDE authentication", () => {
  it("registers a user, creates a session, and rejects it after admin disable", async () => {
    const fixture = createFixture();
    const registered = await fixture.service.register({
      email: "user@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    expect(registered.user.email).toBe("user@example.com");
    const session = await fixture.service.login({
      email: "user@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    expect(fixture.service.getSessionUser(session.token)?.id).toBe(
      registered.user.id,
    );
    fixture.service.setUserEnabled({
      actorId: fixture.adminId,
      userId: registered.user.id,
      enabled: false,
    });
    expect(fixture.service.getSessionUser(session.token)).toBeUndefined();
  });

  it("restores a persisted session using only its non-reversible token hash", async () => {
    const fixture = createFixture();
    const registered = await fixture.service.register({
      email: "persisted@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const session = await fixture.service.login({
      email: registered.user.email,
      password: "CorrectHorseBatteryStaple1",
    });
    const restored = createIdeAuthService({
      load: () => parseIdeAuthState(fixture.service.snapshot()),
      save: () => undefined,
      now: () => "2026-07-18T00:00:00.000Z",
      randomToken: () => "unused",
    });
    expect(restored.getSessionUser(session.token)?.id).toBe(registered.user.id);
    expect(JSON.stringify(restored.snapshot())).not.toContain(session.token);
  });

  it("rejects registration when an administrator disables it and resets passwords with one-time tokens", async () => {
    const fixture = createFixture();
    fixture.service.setRegistrationEnabled({
      actorId: fixture.adminId,
      enabled: false,
    });
    await expect(
      fixture.service.register({
        email: "new@example.com",
        password: "CorrectHorseBatteryStaple1",
      }),
    ).rejects.toThrow("Registration is disabled");
    fixture.service.setRegistrationEnabled({
      actorId: fixture.adminId,
      enabled: true,
    });
    await fixture.service.register({
      email: "new@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    fixture.service.requestPasswordReset("new@example.com");
    const resetToken = fixture.resetTokens.at(-1);
    if (!resetToken) throw new Error("Expected reset delivery.");
    await fixture.service.confirmPasswordReset({
      token: resetToken,
      password: "DifferentCorrectPassword2",
    });
    await expect(
      fixture.service.login({
        email: "new@example.com",
        password: "CorrectHorseBatteryStaple1",
      }),
    ).rejects.toThrow("Invalid credentials");
    await expect(
      fixture.service.login({
        email: "new@example.com",
        password: "DifferentCorrectPassword2",
      }),
    ).resolves.toBeDefined();
    await expect(
      fixture.service.confirmPasswordReset({
        token: resetToken,
        password: "ThirdCorrectPassword3",
      }),
    ).rejects.toThrow("Invalid password reset token");
  });
});

const createFixture = () => {
  let state: IdeAuthState | undefined;
  const resetTokens: string[] = [];
  const service = createIdeAuthService({
    load: () => state,
    save: (next) => {
      state = next;
    },
    now: () => "2026-07-18T00:00:00.000Z",
    randomToken: (() => {
      let sequence = 0;
      return () => `token-${++sequence}`;
    })(),
    deliverPasswordReset: ({ token }) => resetTokens.push(token),
  });
  const admin = service.bootstrapAdmin({
    email: "admin@example.com",
    password: "CorrectHorseBatteryStaple1",
  });
  return { service, adminId: admin.id, resetTokens };
};
