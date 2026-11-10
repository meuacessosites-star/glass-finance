import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Sends all verification/reset OTPs from the Convex backend.
 *
 * Prefer the configured Resend provider. Retain the pre-existing Freebuff
 * transport as a fallback for deployments that have not migrated yet.
 * Never log recipients, OTPs or provider API keys.
 */
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
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        const sender = process.env.AUTH_EMAIL_FROM?.trim();
        if (!sender) {
          console.error("[Glass Finance] Resend configured without AUTH_EMAIL_FROM.");
          throw new Error("Remetente de verificação não configurado");
        }

        const label = id === "password-reset" ? "redefinição de senha" : id === "password-email-verification" ? "confirmação do email" : "acesso";
        const text = `Seu código de ${label} para o Glass Finance é ${token}. Ele é válido por 15 minutos. Se você não solicitou este código, ignore a mensagem.`;
        try {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: sender,
              to: [email],
              subject: "Seu código do Glass Finance",
              text,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            // HTTP status is diagnostic; do not log response bodies or user info.
            console.error(`[Glass Finance] Resend rejected verification email (HTTP ${response.status}).`);
            throw new Error("Não foi possível enviar o código de verificação");
          }
          return;
        } catch (error) {
          if (error instanceof Error && error.message === "Não foi possível enviar o código de verificação") {
            throw error;
          }
          console.error("[Glass Finance] Resend verification email request failed.");
          throw new Error("Não foi possível enviar o código de verificação");
        }
      }

      const legacyApiKey = process.env.AUTH_EMAIL_API_KEY;
      if (!legacyApiKey) {
        console.error("[Glass Finance] No configured email transport in Convex.");
        throw new Error("Serviço de verificação por email não configurado");
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
            headers: { "x-api-key": legacyApiKey },
            timeout: 10_000,
          },
        );
      } catch {
        // Axios errors can contain headers; never expose request credentials.
        throw new Error("Não foi possível enviar o código de verificação");
      }
    },
  });
}

export const emailOtp = createEmailOtp("email-otp");
