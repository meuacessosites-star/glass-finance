import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { AppBackground } from "@/components/app/AppBackground";
import { ArrowRight, Loader2, Mail, UserRound, Wallet } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );
  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);
  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      console.error("Email sign-in error:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);

      console.log("signed in");

      navigate(redirect);
    } catch (error) {
      console.error("OTP verification error:", error);

      setError("The verification code you entered is incorrect.");
      setIsLoading(false);

      setOtp("");
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log("Attempting anonymous sign in...");
      await signIn("anonymous");
      console.log("Anonymous sign in successful");
      navigate(redirect);
    } catch (error) {
      console.error("Guest login error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      setError(`Failed to sign in as guest: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden">
      <AppBackground />

      {/* Auth Content */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <div className="glass glass-strong relative overflow-hidden rounded-[2.2rem] p-7">
            <div className="pointer-events-none absolute -right-14 -top-16 h-40 w-40 rounded-full bg-[#5b9dff]/20 blur-2xl" />

            {/* Header */}
            <div className="relative flex flex-col items-center text-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                aria-label="Voltar para a página inicial"
                className="flex size-14 items-center justify-center rounded-[1.1rem] bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-white shadow-[0_12px_28px_-8px_rgba(47,107,255,0.6)] transition-transform active:scale-95"
              >
                <Wallet className="size-7" strokeWidth={2.2} />
              </button>
              <h1 className="mt-4 text-[22px] font-bold tracking-tight text-glass-ink">
                {step === "signIn" ? "Entrar no GranaScan" : "Verifique seu email"}
              </h1>
              <p className="mt-1.5 text-[13.5px] text-glass-sub">
                {step === "signIn"
                  ? "Entre com seu email ou continue como convidado"
                  : `Enviamos um código para ${step.email}`}
              </p>
            </div>

            {/* Form */}
            <div className="relative mt-6">
              {step === "signIn" ? (
                <form onSubmit={handleEmailSubmit} className="space-y-3">
                  <div className="glass glass-soft flex items-center gap-2.5 rounded-2xl px-4 py-1 transition-shadow focus-within:ring-2 focus-within:ring-primary/40">
                    <Mail className="size-4 shrink-0 text-glass-faint" />
                    <Input
                      name="email"
                      placeholder="nome@email.com"
                      type="email"
                      className="h-11 border-0 bg-transparent px-0 shadow-none outline-none placeholder:text-glass-faint focus-visible:ring-0"
                      disabled={isLoading}
                      required
                    />
                  </div>
                  {error && (
                    <p className="px-1 text-[12.5px] font-medium text-[#FF3B30]">{error}</p>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2F6BFF] py-3.5 text-[14.5px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(47,107,255,0.7)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Continuar com email
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-3 py-1">
                    <span className="h-px flex-1 bg-black/10 dark:bg-black/25" />
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-glass-faint">
                      ou
                    </span>
                    <span className="h-px flex-1 bg-black/10 dark:bg-black/25" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGuestLogin}
                    disabled={isLoading}
                    className="glass glass-soft flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14.5px] font-semibold text-glass-ink transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    <UserRound className="size-4 text-[#2F6BFF]" />
                    Explorar como convidado
                  </button>
                </form>
              ) : (
                <form onSubmit={handleOtpSubmit} className="space-y-4">
                  <input type="hidden" name="email" value={step.email} />
                  <input type="hidden" name="code" value={otp} />

                  <div className="flex justify-center">
                    <InputOTP
                      value={otp}
                      onChange={setOtp}
                      maxLength={6}
                      disabled={isLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                          const form = (e.target as HTMLElement).closest("form");
                          if (form) {
                            form.requestSubmit();
                          }
                        }
                      }}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  {error && (
                    <p className="px-1 text-center text-[12.5px] font-medium text-[#FF3B30]">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading || otp.length !== 6}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2F6BFF] py-3.5 text-[14.5px] font-semibold text-white shadow-[0_12px_28px_-10px_rgba(47,107,255,0.7)] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        Verificar código
                        <ArrowRight className="size-4" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("signIn")}
                    disabled={isLoading}
                    className="w-full text-center text-[13px] font-semibold text-glass-sub transition-colors hover:text-glass-ink"
                  >
                    Usar outro email
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="mt-5 text-center text-[12px] text-muted-foreground">
            Continuando, você concorda com nossos termos de uso e política de
            privacidade.
          </p>
          <p className="mt-2 text-center text-[11.5px] text-muted-foreground/70">
            Seguro por{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline decoration-muted-foreground/50 underline-offset-2 transition-colors hover:text-muted-foreground"
            >
              freebuff.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
