import assert from "node:assert/strict";
import test from "node:test";
import {
  createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync, randomBytes,
} from "node:crypto";
import {
  encodePushPayload, validatePushEndpoint, validatePushKey, vapidAuthorization,
} from "../src/convex/webPushCrypto";

test("Web Push payload decrypts with the real receiver key, authenticated AES-GCM", () => {
  const receiver = createECDH("prime256v1");
  receiver.generateKeys();
  const auth = randomBytes(16);
  const original = JSON.stringify({ title: "Glass Finance", body: "Você tem lembretes" });
  const encoded = encodePushPayload(receiver.getPublicKey(), auth, original);
  assert.equal(encoded.readUInt32BE(16), 4096);
  assert.equal(encoded[20], 65);
  const salt = encoded.subarray(0, 16);
  const senderPublic = encoded.subarray(21, 86);
  const shared = receiver.computeSecret(senderPublic);
  const ikm = Buffer.from(hkdfSync("sha256", shared, auth, Buffer.concat([
    Buffer.from("WebPush: info\0"), receiver.getPublicKey(), senderPublic,
  ]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const encrypted = encoded.subarray(86);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(encrypted.subarray(-16));
  const plaintext = Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)), decipher.final(),
  ]);
  assert.equal(plaintext[plaintext.length - 1], 2);
  assert.equal(plaintext.subarray(0, -1).toString("utf8"), original);
});

test("VAPID JWT uses ES256 signature and correct push-service audience", () => {
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  const publicBytes = pair.getPublicKey();
  const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/example", {
    publicKey: publicBytes.toString("base64url"),
    privateKey: pair.getPrivateKey().toString("base64url"),
    contact: "mailto:test@example.com",
  });
  assert.match(header, /^vapid t=/);
  const signed = header.split("t=")[1].split(", k=")[0];
  const [headerPart, claimsPart, signaturePart] = signed.split(".");
  assert.equal(JSON.parse(Buffer.from(headerPart, "base64url").toString()).alg, "ES256");
  assert.equal(JSON.parse(Buffer.from(claimsPart, "base64url").toString()).aud, "https://fcm.googleapis.com");
  const publicKey = createPublicKey({
    format: "jwk", key: {
      kty: "EC", crv: "P-256",
      x: publicBytes.subarray(1, 33).toString("base64url"),
      y: publicBytes.subarray(33, 65).toString("base64url"),
    },
  });
  assert.equal(
    createVerify("SHA256").update(`${headerPart}.${claimsPart}`).end()
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signaturePart, "base64url")),
    true,
  );
});

test("push endpoints cannot target arbitrary hosts or internal networks", () => {
  assert.equal(validatePushEndpoint("https://fcm.googleapis.com/fcm/send/abc").hostname, "fcm.googleapis.com");
  for (const invalid of [
    "http://fcm.googleapis.com/send/abc", "https://localhost/hook",
    "https://127.0.0.1/send", "https://fcm.googleapis.com.evil.test/send",
    "https://fcm.googleapis.com:8443/send", "https://user@fcm.googleapis.com/send",
  ]) assert.throws(() => validatePushEndpoint(invalid));
  assert.throws(() => validatePushKey("unsafe", 65));
});
