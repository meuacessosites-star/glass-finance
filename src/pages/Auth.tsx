import { AppBackground } from "@/components/app/AppBackground";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, Wallet } from "lucide-react";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

type AuthMode = "signIn" | "signUp";
type AuthStep = "credentials" | "otp" | "verifyEmail" | "resetRequest" | "resetPassword";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/dashboard") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

function friendlyError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.toLowerCase();
  if (message.includes("invalid credentials") || message.includes("invalid code")) {
    return "Email, senha ou código inválido. Confira os dados e tente novamente.";
  }
  if (message.includes("password") && message.includes("8")) {
    return "A senha deve ter pelo menos 8 caracteres.";
  }
  if (message.includes("email")) return "Confira o endereço de email e tente novamente.";
  return fallback;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(searchParams.get("returnTo"), redirectAfterAuth);
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [step, setStep] = useState<AuthStep>("credentials");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const runAuth = async (event: FormEvent<HTMLFormElement>, flow: string, nextStep?: AuthStep) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const data = new FormData(event.currentTarget);
      data.set("flow", flow);
      if (email) data.set("email", email.trim().toLowerCase());
      await signIn("password", data);
      if (nextStep) setStep(nextStep);
      else navigate(redirect, { replace: true });
    } catch (authError) {
      setError(friendlyError(authError, "Não foi possível concluir a solicitação. Verifique sua conexão e tente novamente."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePassword = (event: FormEvent<HTMLFormElement>) => {
    const nextStep: AuthStep | undefined = mode === "signUp" ? "verifyEmail" : undefined;
    void runAuth(event, mode, nextStep);
  };

  const handleGoogle = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await signIn("google");
    } catch (authError) {
      setError(friendlyError(authError, "Não foi possível iniciar o login com Google. Tente novamente."));
      setIsSubmitting(false);
    }
  };

  const requestOtp = async (address: string) => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const normalizedEmail = address.trim().toLowerCase();
      const data = new FormData();
      data.set("email", normalizedEmail);
      await signIn("email-otp", data);
      setEmail(normalizedEmail);
      setStep("otp");
      setNotice("Enviamos um código temporário para seu email.");
    } catch (authError) {
      setError(friendlyError(authError, "Não foi possível enviar o código. Confira o email e tente novamente."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void requestOtp(String(data.get("email") ?? ""));
  };

  const handleEnterWithOtp = () => {
    setCode("");
    setError(null);
    setNotice(null);
    if (email.trim()) void requestOtp(email);
    else setStep("otp");
  };

  const handleOtpVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const data = new FormData(event.currentTarget);
      data.set("email", email);
      data.set("code", code.trim());
      await signIn("email-otp", data);
      navigate(redirect, { replace: true });
    } catch (authError) {
      setError(friendlyError(authError, "Código inválido ou expirado. Solicite um novo código."));
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordResetRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const normalizedEmail = String(data.get("email") ?? "").trim().toLowerCase();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      data.set("email", normalizedEmail);
      data.set("flow", "reset");
      await signIn("password", data);
      setEmail(normalizedEmail);
      setStep("resetPassword");
      setNotice("Se a conta existir, enviaremos um código de redefinição para o email informado.");
    } catch {
      // Mensagem neutra para não revelar se o endereço possui uma conta.
      setEmail(normalizedEmail);
      setStep("resetPassword");
      setNotice("Se a conta existir, enviaremos um código de redefinição para o email informado.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const backToCredentials = () => {
    setStep("credentials");
    setCode("");
    setError(null);
    setNotice(null);
  };

  const title = step === "otp" ? "Confira seu email" : step === "verifyEmail" ? "Confirme seu email" : step === "resetRequest" ? "Recuperar acesso" : step === "resetPassword" ? "Criar nova senha" : mode === "signUp" ? "Crie sua conta" : "Acesse sua conta";
  const description = step === "otp" || step === "verifyEmail" || step === "resetPassword" ? `Enviamos um código para ${email}.` : step === "resetRequest" ? "Vamos enviar um código para redefinir sua senha." : mode === "signUp" ? "Seus dados ficam vinculados à sua conta e podem ser sincronizados entre dispositivos." : "Entre para acessar seus dados financeiros.";

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <AppBackground />
      <section className="relative z-10 w-full max-w-[460px]">
        <div className="glass glass-strong relative overflow-hidden rounded-[2rem] border border-white/60 p-6 sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#5b9dff]/20 blur-3xl" />
          <header className="relative text-center">
            <button type="button" onClick={() => navigate("/")} aria-label="Voltar para o início" className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-white transition-transform hover:scale-[1.03] active:scale-95">
              <Wallet className="size-7" strokeWidth={2.2} />
            </button>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-[#2F6BFF]">Glass Finance</p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-glass-ink">{title}</h1>
            <p className="mx-auto mt-2 max-w-[340px] text-sm leading-6 text-glass-sub">{description}</p>
          </header>

          {step === "credentials" && (
            <>
              <div className="relative mt-6 grid grid-cols-2 rounded-full border border-black/10 bg-white/45 p-1 dark:border-white/10">
                {(["signIn", "signUp"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => { setMode(value); setError(null); setNotice(null); }} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${mode === value ? "bg-[#2F6BFF] text-white" : "text-glass-sub hover:text-glass-ink"}`}>
                    {value === "signIn" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>

              <button type="button" onClick={handleGoogle} disabled={isSubmitting} className="relative mt-4 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.15a11 11 0 0 0 0 9.9l3.69-2.84Z"/><path fill="#EA4335" d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0a11 11 0 0 0-9.85 7.05l3.69 2.84C6.71 7.29 9.14 4.36 12 4.36Z"/></svg>}
                Continuar com Google
              </button>

              <div className="relative my-5 flex items-center gap-3"><span className="h-px flex-1 bg-black/10 dark:bg-white/15"/><span className="text-[11px] font-semibold uppercase tracking-wider text-glass-faint">ou use seu email</span><span className="h-px flex-1 bg-black/10 dark:bg-white/15"/></div>

              <form onSubmit={handlePassword} className="relative space-y-3">
                <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Email</span><span className="relative block"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-glass-faint"/><Input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="h-12 rounded-xl border-black/10 bg-white/60 pl-10 dark:border-white/15 dark:bg-black/10" /></span></label>
                <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Senha</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-glass-faint"/><Input name="password" type={passwordVisible ? "text" : "password"} autoComplete={mode === "signUp" ? "new-password" : "current-password"} minLength={8} required placeholder="Mínimo de 8 caracteres" className="h-12 rounded-xl border-black/10 bg-white/60 pl-10 pr-12 dark:border-white/15 dark:bg-black/10"/><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-glass-faint hover:text-glass-ink">{passwordVisible ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></span></label>
                {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
                {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
                <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-4 text-sm font-semibold text-white transition-all hover:bg-[#2458df] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
                  {isSubmitting ? <Loader2 className="size-4 animate-spin"/> : <>{mode === "signUp" ? "Criar conta" : "Entrar"}<ArrowRight className="size-4"/></>}
                </button>
              </form>
              <div className="relative mt-4 flex flex-col items-center gap-2 text-center">
                {mode === "signIn" && <button type="button" onClick={() => { setStep("resetRequest"); setError(null); setNotice(null); }} className="text-sm font-semibold text-[#2F6BFF] hover:underline">Esqueci minha senha</button>}
                <button type="button" onClick={handleEnterWithOtp} disabled={isSubmitting} className="text-xs font-medium text-glass-sub hover:text-glass-ink disabled:opacity-60">Entrar com código temporário por email</button>
              </div>
            </>
          )}

          {step === "otp" && (
            <div className="relative mt-7 space-y-4">
              {!email ? <form onSubmit={handleOtpRequest} className="space-y-3"><label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Email</span><Input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="h-12 rounded-xl bg-white/60"/></label><button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] font-semibold text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="size-4 animate-spin"/> : "Enviar código"}</button></form> : <form onSubmit={handleOtpVerify} className="space-y-3"><input type="hidden" name="email" value={email}/><label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Código de 6 dígitos</span><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="h-12 rounded-xl bg-white/60 text-center text-lg tracking-[0.35em]"/></label><button type="submit" disabled={isSubmitting || code.length !== 6} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] font-semibold text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="size-4 animate-spin"/> : "Verificar código"}</button></form>}
              {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}{notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
              <button type="button" onClick={backToCredentials} className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-glass-sub hover:text-glass-ink"><ArrowLeft className="size-4"/>Voltar</button>
            </div>
          )}

          {step === "verifyEmail" && (
            <form onSubmit={(event) => void runAuth(event, "email-verification")} className="relative mt-7 space-y-4">
              <input type="hidden" name="email" value={email}/><label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Código de confirmação</span><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="h-12 rounded-xl bg-white/60 text-center text-lg tracking-[0.35em]"/></label>
              {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}{notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
              <button type="submit" disabled={isSubmitting || code.length !== 6} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] font-semibold text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="size-4 animate-spin"/> : "Confirmar email"}</button>
              <button type="button" onClick={backToCredentials} className="w-full py-2 text-sm font-semibold text-glass-sub hover:text-glass-ink">Voltar</button>
            </form>
          )}

          {step === "resetRequest" && (
            <form onSubmit={handlePasswordResetRequest} className="relative mt-7 space-y-4">
              <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Email da sua conta</span><Input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="h-12 rounded-xl bg-white/60"/></label>
              {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}{notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
              <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] font-semibold text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="size-4 animate-spin"/> : "Enviar instruções"}</button>
              <button type="button" onClick={backToCredentials} className="w-full py-2 text-sm font-semibold text-glass-sub hover:text-glass-ink">Voltar para entrar</button>
            </form>
          )}

          {step === "resetPassword" && (
            <form onSubmit={(event) => void runAuth(event, "reset-verification")} className="relative mt-7 space-y-4">
              <input type="hidden" name="email" value={email}/><label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Código de redefinição</span><Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="h-12 rounded-xl bg-white/60 text-center text-lg tracking-[0.35em]"/></label>
              <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Nova senha</span><Input name="newPassword" type="password" autoComplete="new-password" minLength={8} required placeholder="Mínimo de 8 caracteres" className="h-12 rounded-xl bg-white/60"/></label>
              {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}{notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
              <button type="submit" disabled={isSubmitting || code.length !== 6} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] font-semibold text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="size-4 animate-spin"/> : "Redefinir senha"}</button>
              <button type="button" onClick={() => { setStep("resetRequest"); setCode(""); setError(null); }} className="w-full py-2 text-sm font-semibold text-glass-sub hover:text-glass-ink">Solicitar outro código</button>
            </form>
          )}
        </div>
        <p className="mx-auto mt-5 max-w-[390px] text-center text-xs leading-5 text-glass-sub">Sua conta protege o acesso aos dados. O salvamento e a sincronização dependem da conexão segura com o serviço de dados.</p>
      </section>
    </main>
  );
}

export default function AuthPage(props: AuthProps) {
  return <Suspense><Auth {...props}/></Suspense>;
}
