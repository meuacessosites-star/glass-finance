import { strict as assert } from "node:assert";
import { generateKeyPairSync, verify } from "node:crypto";
import { test } from "node:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api } from "../src/convex/_generated/api";
import { dashboardReturnTo, normalizeEmail, normalizeUsername, suggestUsername } from "../src/lib/auth-fields";

const issuer = "https://test.convex.site";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
process.env.CONVEX_SITE_URL = issuer;
process.env.SITE_URL = "https://glass.example";
process.env.JWT_PRIVATE_KEY = keys.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
process.env.AUTH_EMAIL_API_KEY = "test-fixture";
process.env.AUTH_GOOGLE_ID = "test-client";
process.env.AUTH_GOOGLE_SECRET = "test-fixture";
delete process.env.RESEND_API_KEY;
process.env.AUTH_LOG_LEVEL = "ERROR";

const modules = {
  "./_generated/api.ts": () => import("../src/convex/_generated/api"),
  "./auth.ts": () => import("../src/convex/auth"),
  "./http.ts": () => import("../src/convex/http"),
  "./users.ts": () => import("../src/convex/users"),
  "./financeState.ts": () => import("../src/convex/financeState"),
  "./people.ts": () => import("../src/convex/people"),
};

function fixture() {
  const t = convexTest(schema, modules);
  const mailbox = new Map<string, string>();
  // Only the delivery transport is substituted. The provider creates, hashes,
  // expires and verifies its own codes, passwords and session tokens.
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://accounts.google.com/.well-known/openid-configuration") {
      return Response.json({
        issuer: "https://accounts.google.com", authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
        token_endpoint: "https://oauth2.googleapis.com/token", userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
        jwks_uri: "https://www.googleapis.com/oauth2/v3/certs", code_challenge_methods_supported: ["S256"],
      });
    }
    assert.equal(String(input), "https://auth.freebuff.app/send_otp");
    const { to, otp } = JSON.parse(String(init?.body));
    assert.match(otp, /^\d{6}$/);
    mailbox.set(to, otp);
    return new Response(null, { status: 202 });
  };
  const password = (email: string, flow: string, extra = {}) =>
    t.action(api.auth.signIn, { provider: "password", params: { email, flow, ...extra } });
  const session = (result: { tokens?: { token: string } }) => {
    assert.ok(result.tokens?.token);
    const [header, payload, signature] = result.tokens.token.split(".");
    assert.ok(verify("RSA-SHA256", Buffer.from(header + "." + payload), keys.publicKey, Buffer.from(signature, "base64url")));
    const jwt = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.equal(jwt.iss, issuer);
    assert.equal(jwt.aud, "convex");
    return t.withIdentity({ issuer, subject: jwt.sub });
  };
  const register = async (email: string, secret: string) => {
    return session(await password(email, "signUp", { password: secret }));
  };
  return { t, mailbox, password, session, register };
}

test("username and protected return URL rules", () => {
  assert.equal(normalizeUsername(" ALine_23 "), "aline_23");
  for (const invalid of ["", "ab", "a".repeat(25), "a@b", "a b", "álî", "Kate"]) assert.equal(normalizeUsername(invalid), null);
  assert.equal(normalizeEmail("  A@EXAMPLE.ORG "), "a@example.org");
  assert.equal(suggestUsername("Áline da Silva", "foo@example.org"), "aline_da_silva");
  assert.equal(suggestUsername("  ", "Usuario Teste@example.org"), "usuario_teste");
  assert.equal(suggestUsername(undefined, undefined), "usuario");
  assert.equal(normalizeEmail("x@@example.org"), null);
  assert.equal(dashboardReturnTo("/dashboard/conta?periodo=1#hoje"), "/dashboard/conta?periodo=1#hoje");
  for (const path of ["//evil.example", "//[", "/\\evil.example", "/dashboard/../auth", "/auth"]) {
    assert.equal(dashboardReturnTo(path), "/dashboard");
  }
});

test("signup, verification, recovery, username login and session isolation", async () => {
  const { t, mailbox, password, session, register } = fixture();
  const alice = "alice@example.org", bob = "bob@example.org";
  const secret = "valid-pass-1", replacement = "new-valid-pass";
  await assert.rejects(password(alice, "signUp", { password: "short" }));
  await assert.rejects(password("not-an-email", "signUp", { password: secret }));
  const first = session(await password(alice, "signUp", { password: secret }));
  assert.ok(!mailbox.has(alice), "Registration must not send an email code");
  assert.ok((await password(alice, "signIn", { password: secret })).tokens);
  await assert.rejects(t.mutation(api.users.claimUsername, { username: "alice" }));
  await assert.rejects(first.query(api.financeState.getMine));
  await first.mutation(api.users.claimUsername, { username: "Alice" });
  await first.mutation(api.users.claimUsername, { username: "ALICE" });
  assert.equal((await first.query(api.users.currentUser)).username, "alice");
  // Registering the same verified password account again cannot create
  // another identity and cannot replace its financial history.
  await assert.rejects(password(alice, "signUp", { password: "different-pass-123" }));
  const existingAlice = await first.query(api.users.currentUser);
  const signedInAgain = session(await password(alice, "signIn", { password: secret }));
  assert.equal((await signedInAgain.query(api.users.currentUser))._id, existingAlice._id);
  const secondUser = await register(bob, secret);
  await assert.rejects(secondUser.mutation(api.users.claimUsername, { username: "aLiCe" }));
  await secondUser.mutation(api.users.claimUsername, { username: "bob" });
  const person = await first.mutation(api.people.create, { name: "Contato" });
  const payload = JSON.stringify({ profiles: [{ name: "Conta A" }] });
  await first.mutation(api.financeState.saveMine, { expectedRevision: 0, payload });
  assert.equal(await secondUser.query(api.financeState.getMine), null);
  await assert.rejects(secondUser.mutation(api.people.remove, { id: person }));
  await first.action(api.auth.signOut);
  const alias = (username: string, password: string) => t.action(api.auth.signIn, { provider: "username", params: { username, password } });
  await assert.rejects(alias("alice", "bad-password"));
  await assert.rejects(alias("unknown", secret));
  const again = session(await alias("ALICE", secret));
  assert.equal((await again.query(api.financeState.getMine)).payload, payload);
  assert.deepEqual((await again.query(api.people.list)).map(p => p.name), ["Contato"]);
  await password(alice, "reset");
  const resetCode = mailbox.get(alice);
  await assert.rejects(password(bob, "reset-verification", { newPassword: replacement, code: resetCode }));
  await password(alice, "reset-verification", { newPassword: replacement, code: resetCode });
  await assert.rejects(password(alice, "signIn", { password: secret }));
  assert.equal((await session(await alias("alice", replacement)).query(api.users.currentUser)).email, alice);
  assert.equal((await session(await password(bob, "signIn", { password: secret })).query(api.users.currentUser)).username, "bob");
  await assert.rejects(t.action(api.auth.signIn, { provider: "anonymous" }));
  const google = await t.action(api.auth.signIn, { provider: "google", params: { redirectTo: "/auth?returnTo=%2Fdashboard" } });
  assert.equal(new URL(google.redirect).origin, issuer);
  assert.equal(new URL(google.redirect).pathname, "/api/auth/signin/google");
  assert.ok(google.verifier);
  const startUrl = new URL(google.redirect);
  const start = await t.fetch(startUrl.pathname + startUrl.search);
  assert.equal(start.status, 302);
  const consent = new URL(start.headers.get("Location")!);
  assert.equal(consent.origin, "https://accounts.google.com");
  assert.equal(consent.searchParams.get("redirect_uri"), issuer + "/api/auth/callback/google");
  assert.equal(consent.searchParams.get("client_id"), "test-client");
  assert.ok(consent.searchParams.get("code_challenge"));
});

test("older accounts choose one handle and reopen their newest legacy snapshot across sessions", async () => {
  const { t } = fixture();
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "legacy@example.org", emailVerificationTime: 1 });
    const other = await ctx.db.insert("users", { email: "other@example.org", emailVerificationTime: 1 });
    for (const [subject, updatedAt] of [[user + "|tok1", 10], [user + "|tok2", 20], [other + "|tok3", 30]] as const) {
      await ctx.db.insert("financeStates", { userSubject: subject, revision: 1, updatedAt, chunkCount: 1 });
      await ctx.db.insert("financeStateChunks", { userSubject: subject, revision: 1, chunkIndex: 0, payload: String(updatedAt) });
      await ctx.db.insert("people", { userSubject: subject, name: String(updatedAt), createdAt: 1 });
    }
    return { user, other };
  });
  const me = t.withIdentity({ issuer, subject: ids.user + "|new-session" });
  const other = t.withIdentity({ issuer, subject: ids.other + "|new-session" });
  const race = await Promise.allSettled([me, other].map(client => client.mutation(api.users.claimUsername, { username: "shared" })));
  assert.equal(race.filter(r => r.status === "fulfilled").length, 1);
  if (!(await me.query(api.users.currentUser)).username) await me.mutation(api.users.claimUsername, { username: "legacy" });
  if (!(await other.query(api.users.currentUser)).username) await other.mutation(api.users.claimUsername, { username: "other" });
  assert.equal((await me.query(api.financeState.getMine)).payload, "20");
  assert.equal((await other.query(api.financeState.getMine)).payload, "30");
  assert.deepEqual((await me.query(api.people.list)).map(p => p.name).sort(), ["10", "20"]);
  const foreign = t.withIdentity({ issuer: "https://other.example", subject: ids.user + "|tok1" });
  await assert.rejects(foreign.query(api.financeState.getMine));
  const oldSnapshot = await me.query(api.financeState.getMine);
  const cleared = await me.mutation(api.financeState.deleteMine);
  assert.equal(cleared.deleted, true);
  assert.ok(cleared.revision > oldSnapshot.revision);
  const tombstone = await me.query(api.financeState.getMine);
  assert.equal(tombstone.payload, "");
  assert.equal(tombstone.revision, cleared.revision);
  assert.equal((await other.query(api.financeState.getMine)).payload, "30");
  const staleWrite = await me.mutation(api.financeState.saveMine, {
    expectedRevision: oldSnapshot.revision,
    payload: JSON.stringify({ profiles: [{ name: "Dado antigo" }] }),
  });
  assert.equal(staleWrite.ok, false);
  assert.equal((await me.query(api.financeState.getMine)).payload, "");
});

test("two sessions see account saves and deletions, with no stale resurrection after logout", async () => {
  const { t, register, password, session } = fixture();
  const email = "sync@example.org";
  const secret = "secure-password-123";
  const first = await register(email, secret);
  await first.mutation(api.users.claimUsername, { username: "sync_account" });
  const user = await first.query(api.users.currentUser);
  const second = t.withIdentity({ issuer, subject: String(user._id) + "|second-device" });
  assert.equal(await first.query(api.financeState.getMine), null);
  assert.equal(await second.query(api.financeState.getMine), null);
  const one = JSON.stringify({ profiles: [{ name: "Salvo no celular", transactions: [{ amount: 12.45 }] }] });
  const firstSave = await first.mutation(api.financeState.saveMine, { payload: one, expectedRevision: 0 });
  assert.equal(firstSave.ok, true);
  assert.equal((await second.query(api.financeState.getMine)).payload, one);
  const two = JSON.stringify({ profiles: [{ name: "Editado no computador", transactions: [] }] });
  const updated = await second.mutation(api.financeState.saveMine, { payload: two, expectedRevision: firstSave.revision });
  assert.equal(updated.ok, true);
  assert.equal((await first.query(api.financeState.getMine)).payload, two);
  const conflict = await first.mutation(api.financeState.saveMine, { payload: one, expectedRevision: firstSave.revision });
  assert.equal(conflict.ok, false);
  assert.equal((await first.query(api.financeState.getMine)).payload, two);
  const deleted = await second.mutation(api.financeState.deleteMine);
  assert.equal(deleted.deleted, true);
  const blank = await first.query(api.financeState.getMine);
  assert.equal(blank.revision, deleted.revision);
  assert.equal(blank.payload, "");
  assert.equal((await first.mutation(api.financeState.saveMine, { payload: one, expectedRevision: updated.revision })).ok, false);
  assert.equal((await second.query(api.financeState.getMine)).payload, "");
  const savedAgain = await first.mutation(api.financeState.saveMine, { payload: two, expectedRevision: deleted.revision });
  assert.equal(savedAgain.ok, true);
  await first.action(api.auth.signOut);
  const reopened = session(await password(email, "signIn", { password: secret }));
  assert.equal((await reopened.query(api.financeState.getMine)).payload, two);
  assert.equal((await reopened.query(api.users.currentUser)).username, "sync_account");
});

test("optional Google username is generated uniquely and can change without changing account data", async () => {
  const { t } = fixture();
  const ids = await t.run(async (ctx) => ({
    first: await ctx.db.insert("users", { email: "ana1@gmail.com", name: "Ana Maria", emailVerificationTime: 1 }),
    second: await ctx.db.insert("users", { email: "ana2@gmail.com", name: "Ana Maria", emailVerificationTime: 1 }),
    third: await ctx.db.insert("users", { email: "ana3@gmail.com", name: "Ana Maria", emailVerificationTime: 1 }),
  }));
  const first = t.withIdentity({ issuer, subject: String(ids.first) + "|google-session" });
  const second = t.withIdentity({ issuer, subject: String(ids.second) + "|google-session" });
  const third = t.withIdentity({ issuer, subject: String(ids.third) + "|google-session" });
  await first.mutation(api.users.claimUsername, {});
  await second.mutation(api.users.claimUsername, {});
  await third.mutation(api.users.claimUsername, { username: "custom_ana" });
  assert.equal((await first.query(api.users.currentUser)).username, "ana_maria");
  assert.equal((await second.query(api.users.currentUser)).username, "ana_maria_2");
  assert.equal((await third.query(api.users.currentUser)).username, "custom_ana");
  const payload = JSON.stringify({ profiles: [{ name: "Dados preservados" }] });
  await first.mutation(api.financeState.saveMine, { payload, expectedRevision: 0 });
  await assert.rejects(second.mutation(api.users.updateUsername, { username: "ana_maria" }));
  await first.mutation(api.users.updateUsername, { username: "meu_usuario" });
  assert.equal((await first.query(api.users.currentUser)).username, "meu_usuario");
  assert.equal((await first.query(api.financeState.getMine)).payload, payload);
  assert.equal((await second.query(api.users.currentUser)).username, "ana_maria_2");
});

test("account password creation for verified Google identity and password changes stay on the same user", async () => {
  const { t, password, session, register } = fixture();
  const email = "verified-google@gmail.com";
  const userId = await t.run(ctx => ctx.db.insert("users", {
    email, name: "Google Example", emailVerificationTime: Date.now(),
  }));
  const googleSession = t.withIdentity({ issuer, subject: String(userId) + "|google-auth" });
  await googleSession.mutation(api.users.claimUsername, { username: "google_person" });
  const initial = await googleSession.query(api.users.passwordStatus);
  assert.deepEqual(initial, { hasPassword: false, canCreate: true, canLinkExisting: false });
  const payload = JSON.stringify({ profiles: [{ name: "Metas importantes" }] });
  await googleSession.mutation(api.financeState.saveMine, { expectedRevision: 0, payload });

  await assert.rejects(googleSession.action(api.users.managePassword, { newPassword: "short" }));
  await googleSession.action(api.users.managePassword, { newPassword: "first-safe-password" });
  assert.equal((await googleSession.query(api.users.passwordStatus)).hasPassword, true);
  const fromPassword = session(await password(email, "signIn", { password: "first-safe-password" }));
  assert.equal((await fromPassword.query(api.users.currentUser))._id, userId);
  assert.equal((await fromPassword.query(api.financeState.getMine)).payload, payload);

  await assert.rejects(fromPassword.action(api.users.managePassword, {
    currentPassword: "wrong-pass", newPassword: "replacement-password",
  }));
  await assert.rejects(fromPassword.action(api.users.managePassword, {
    newPassword: "replacement-password",
  }));
  await fromPassword.action(api.users.managePassword, {
    currentPassword: "first-safe-password", newPassword: "replacement-password",
  });
  await assert.rejects(password(email, "signIn", { password: "first-safe-password" }));
  const loggedBackIn = session(await password(email, "signIn", { password: "replacement-password" }));
  assert.equal((await loggedBackIn.query(api.users.currentUser))._id, userId);
  assert.equal((await loggedBackIn.query(api.financeState.getMine)).payload, payload);
  assert.equal((await loggedBackIn.query(api.users.currentUser)).username, "google_person");
  const other = await register("another-person@gmail.com", "another-safe-password");
  await other.mutation(api.users.claimUsername, { username: "another_person" });
  assert.equal((await other.query(api.users.passwordStatus)).hasPassword, true);
  assert.equal(await other.query(api.financeState.getMine), null);
});

test("unverified password registration never attaches to an existing Google financial account", async () => {
  const { t, password, session } = fixture();
  const email = "existing-google@gmail.com";
  const originalId = await t.run(ctx => ctx.db.insert("users", {
    email, name: "Original Google", emailVerificationTime: Date.now(),
  }));
  const google = t.withIdentity({ issuer, subject: String(originalId) + "|google" });
  await google.mutation(api.users.claimUsername, { username: "true_owner" });
  await google.mutation(api.financeState.saveMine, {
    payload: JSON.stringify({ profiles: [{ name: "Private records" }] }), expectedRevision: 0,
  });
  const passwordAccount = session(await password(email, "signUp", { password: "unverified-password" }));
  const passwordOwner = await passwordAccount.query(api.users.currentUser);
  assert.notEqual(passwordOwner._id, originalId);
  await passwordAccount.mutation(api.users.claimUsername, { username: "email_signup" });
  assert.equal(await passwordAccount.query(api.financeState.getMine), null);
  assert.equal((await google.query(api.financeState.getMine)).payload,
    JSON.stringify({ profiles: [{ name: "Private records" }] }));
});
