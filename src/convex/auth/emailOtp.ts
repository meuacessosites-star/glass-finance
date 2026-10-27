import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/** Creates an email provider with its own Convex Auth ID and message purpose. */
export function createEmailOtp(id: string) {
  return Email({
    id,
    maxAge: 60 * 15,
    async generateVerificationToken() {
      const random: RandomReader = {
        read(bytes: Uint8Array) {
          crypto.getRandomValues(bytes);
        },
      };
      return generateRandomString(random, "0123456789", 6);
    },
    async sendVerificationRequest({ identifier: email, token }) {
      const apiKey = process.env.AUTH_EMAIL_API_KEY;
      if (!apiKey) {
        throw new Error("AUTH_EMAIL_API_KEY não configurada no ambiente do Convex");
      }
      try {
        await axios.post(
          "https://auth.freebuff.app/send_otp",
          {
            to: email,
            otp: token,
            appName: process.env.VLY_APP_NAME || "Glass Finance",
          },
          {
            headers: { "x-api-key": apiKey },
            timeout: 10_000,
          },
        );
      } catch {
        // Axios errors can contain headers; never return request credentials to users.
        throw new Error("Não foi possível enviar o email de verificação");
      }
    },
  });
}

export const emailOtp = createEmailOtp("email-otp");
