import { createTestAiConnection, createTestDatabase, createTestTenant } from "@postula/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import { authenticateAiToken, hashOAuthToken } from "./ai-connections";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;
const connect = (
  userId: string,
  options: Partial<Parameters<typeof createTestAiConnection>[2]> = {},
) => createTestAiConnection(db, userId, { hashToken: hashOAuthToken, ...options });

describe("authenticateAiToken", () => {
  it("finds the person, the AI and its scopes behind a valid token", async () => {
    const { userId } = await createTestTenant(db);
    const { token, clientId } = await connect(userId, { scopes: ["read", "openid"] });

    expect(await authenticateAiToken(db, token)).toEqual({
      userId,
      clientId,
      clientName: "Claude",
      scopes: ["read"],
    });
  });

  it("refuses an expired token, a revoked one and one whose consent was removed", async () => {
    const { userId } = await createTestTenant(db);
    const expired = await connect(userId, { expiresAt: new Date(Date.now() - 1000) });
    const revoked = await connect(userId, { revoked: new Date() });
    const removed = await connect(userId, { consent: false });

    expect(await authenticateAiToken(db, expired.token)).toBeNull();
    expect(await authenticateAiToken(db, revoked.token)).toBeNull();
    expect(await authenticateAiToken(db, removed.token)).toBeNull();
  });

  it("refuses anything that isn't one of our access tokens", async () => {
    const { userId } = await createTestTenant(db);
    const { token } = await connect(userId);

    expect(await authenticateAiToken(db, token.replace("pst_at_", "pst_rt_"))).toBeNull();
    expect(await authenticateAiToken(db, "pst_at_")).toBeNull();
    expect(await authenticateAiToken(db, `${token}x`)).toBeNull();
  });
});
