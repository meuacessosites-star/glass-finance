"use node";

import {
  createCipheriv, createECDH, createPrivateKey, createSign, hkdfSync, randomBytes,
} from "node:crypto";

const b64url = (value: Buffer) => value.toString("base64url");
const decode = (encoded: string) => Buffer.from(encoded, "base64url");

/** Restrict outbound HTTPS requests to known push service hosts. */
export function validatePushEndpoint(value: string): URL {
  if (value.length > 2048) throw new Error("Endereço push inválido");
  const url = new URL(value);
  const domain = url.hostname.toLowerCase();
  const validHost =
    domain === "fcm.googleapis.com" ||
    domain === "updates.push.services.mozilla.com" ||
    domain === "web.push.apple.com" ||
    domain.endsWith(".push.apple.com") ||
    domain.endsWith(".push.services.mozilla.com");
  if (url.protocol !== "https:" || url.username || url.password ||
      url.port || !validHost) throw new Error("Provedor push não autorizado");
  return url;
}
export function validatePushKey(value: string, expectedBytes: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Chave push inválida");
  const raw = decode(value);
  if (raw.length !== expectedBytes) throw new Error("Tamanho da chave push inválido");
  return raw;
}
export type PushCredentials = {
  endpoint: string;
  p256dh: string;
  auth: string;
};
export type VapidCredentials = {
  publicKey: string;
  privateKey: string;
  contact: string;
};

/** Web Push aes128gcm content encoding (RFC 8291 / 8188).
 * The push service sees only encrypted, generic reminder text.
 */
export function encodePushPayload(
  clientPublicKey: Buffer,
  authSecret: Buffer,
  payload: string,
): Buffer {
  if (clientPublicKey.length !== 65 || clientPublicKey[0] !== 4 ||
      authSecret.length !== 16) throw new Error("Inscrição push inválida");
  const sender = createECDH("prime256v1");
  sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(clientPublicKey);
  const context = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"), clientPublicKey, senderPublicKey,
  ]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, context, 32));
  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const encoded = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  if (encoded.length > 3000) throw new Error("Notificação muito grande");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(encoded), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([senderPublicKey.length]), senderPublicKey, encrypted]);
}

export function vapidAuthorization(endpoint: string, credentials: VapidCredentials) {
  const url = validatePushEndpoint(endpoint);
  const publicKey = validatePushKey(credentials.publicKey, 65);
  const privateKey = validatePushKey(credentials.privateKey, 32);
  const contact = credentials.contact;
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    throw new Error("Contato VAPID inválido");
  }
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC", crv: "P-256",
      x: b64url(publicKey.subarray(1, 33)),
      y: b64url(publicKey.subarray(33, 65)),
      d: b64url(privateKey),
    },
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(Buffer.from(JSON.stringify({
    aud: url.origin,
    exp: Math.floor(Date.now() / 1000) + 10 * 60 * 60,
    sub: contact,
  })));
  const signed = `${header}.${claims}`;
  const signature = createSign("SHA256").update(signed).end()
    .sign({ key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${signed}.${b64url(signature)}, k=${credentials.publicKey}`;
}

export async function deliverWebPush(
  device: PushCredentials, credentials: VapidCredentials, message: string,
): Promise<number> {
  const url = validatePushEndpoint(device.endpoint);
  const clientKey = validatePushKey(device.p256dh, 65);
  const auth = validatePushKey(device.auth, 16);
  const body = encodePushPayload(clientKey, auth, message);
  const response = await fetch(url.href, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: vapidAuthorization(url.href, credentials),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(15_000),
  });
  return response.status;
}
