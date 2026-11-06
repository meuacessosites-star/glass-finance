import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { normalizeEmail } from "../../lib/auth-fields";

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
      if (normalizeEmail(email) !== email) throw new Error("E-mail inválido.");
      const resendKey = process.env.RESEND_API_KEY;
      const from = process.env.AUTH_EMAIL_FROM;
      const apiKey = process.env.AUTH_EMAIL_API_KEY;
      let response: Response;
      if (resendKey && from) {
        const subject = id === "password-reset" ? "Redefinição de senha" : id === "email-otp" ? "Código de acesso" : "Confirme seu e-mail";
        response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({ from, to: [email], subject: `${subject} · Glass Finance`,
            text: `Seu código do Glass Finance é ${token}. Ele vale por 15 minutos.\nSe você não fez essa solicitação, ignore este e-mail.` }),
        });
      } else if (apiKey) {
        response = await fetch("https://auth.freebuff.app/send_otp", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            to: email,
            otp: token,
            appName: process.env.VLY_APP_NAME || "Glass Finance",
          }),
        });
      } else throw new Error("Envio de e-mail não configurado.");
      if (!response.ok) throw new Error("Não foi possível enviar o e-mail de verificação.");
    },
  });
}

export const emailOtp = createEmailOtp("email-otp");
