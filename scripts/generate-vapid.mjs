import { createECDH } from "node:crypto";

// Run locally. Never commit these generated secrets or print them in CI logs.
const vapid = createECDH("prime256v1");
vapid.generateKeys();
console.log("PUSH_VAPID_PUBLIC_KEY=" + vapid.getPublicKey().toString("base64url"));
console.log("PUSH_VAPID_PRIVATE_KEY=" + vapid.getPrivateKey().toString("base64url"));
console.log("PUSH_VAPID_CONTACT=mailto:SEU_EMAIL_VALIDO_AQUI");
console.log("\nA chave PRIVADA deve ficar exclusivamente nas variáveis do Convex.");
