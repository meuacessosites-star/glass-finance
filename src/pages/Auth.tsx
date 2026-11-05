import { AppBackground } from "@/components/app/AppBackground";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { dashboardReturnTo, normalizeEmail, normalizeUsername, suggestUsername, USERNAME_HELP, USERNAME_PATTERN } from "@/lib/auth-fields";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Wallet } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";

type Step = "signIn" | "signUp" | "verifyEmail" | "otpRequest" | "otpVerify" | "resetRequest" | "resetVerify";
const inputClass = "h-12 rounded-xl border-black/10 bg-white/60 dark:border-white/15 dark:bg-black/10";
const labelClass = "block space-y-1.5 text-xs font-semibold text-glass-sub";
const linkClass = "text-sm font-semibold text-glass-sub hover:text-glass-ink disabled:opacity-60";
const titles = {
  signIn: "Acesse sua conta", signUp: "Crie sua conta", verifyEmail: "Confirme seu e-mail",
  otpRequest: "Entrar com código", otpVerify: "Confira seu e-mail",
  resetRequest: "Recuperar acesso", resetVerify: "Crie uma nova senha",
  username: "Como quer ser chamado?", switchAccount: "Entre com uma conta verificada",
};
const buttons = {
  signIn: "Entrar", signUp: "Criar conta", verifyEmail: "Confirmar e-mail", otpRequest: "Enviar código",
  otpVerify: "Verificar código", resetRequest: "Enviar instruções", resetVerify: "Salvar nova senha",
  username: "Continuar para o painel", switchAccount: "Trocar de conta",
};

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.15v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.15a11 11 0 0 0 0 9.9l3.69-2.84Z"/><path fill="#EA4335" d="M12 4.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0a11 11 0 0 0-9.85 7.05l3.69 2.84C6.71 7.29 9.14 4.36 12 4.36Z"/></svg>;
}

export default function AuthPage({ redirectAfterAuth = "/dashboard" }: { redirectAfterAuth?: string }) {
  const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
  const claimUsername = useMutation(api.users.claimUsername);
  const methods = useQuery(api.users.authMethods);
  const [params] = useSearchParams();
  const redirect = dashboardReturnTo(params.get("returnTo"), redirectAfterAuth);
  const [step, setStep] = useState<Step>(params.get("modo") === "cadastro" ? "signUp" : "signIn");
  const [address, setAddress] = useState("");
  const [preferredUsername, setPreferredUsername] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const screen = isAuthenticated ? (user ? "username" : "switchAccount") : step;
  const credentials = screen === "signIn" || screen === "signUp";
  const hasCode = screen === "verifyEmail" || screen === "otpVerify" || screen === "resetVerify";
  const needsEmail = screen === "signUp" || screen === "otpRequest" || screen === "resetRequest";
  const hasPassword = credentials || screen === "resetVerify";

  const changeStep = (next: Step) => {
    setStep(next);
    setError("");
    setNotice("");
    setVisible(false);
  };

  const run = async (operation: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof ConvexError && typeof cause.data === "string" ? cause.data : fallback);
    } finally {
      setBusy(false);
    }
  };

  const requestCode = async (kind: "otpRequest" | "resetRequest" | "verifyEmail", email: string) => {
    if (kind === "resetRequest") {
      try { await signIn("password", { flow: "reset", email }); } catch { /* Do not reveal account existence. */ }
      setStep("resetVerify");
      setNotice("Se houver uma conta com senha, você receberá o código por e-mail.");
    } else if (kind === "otpRequest") {
      await signIn("email-otp", { email });
      setStep("otpVerify");
      setNotice("Use o código mais recente que enviamos para o seu e-mail.");
    } else {
      await signIn("password", { flow: "email-verification", email });
      setNotice("Enviamos um novo código de confirmação.");
    }
    setAddress(email);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    if (screen === "switchAccount") {
      void run(signOut, "Não foi possível sair. Tente novamente.");
      return;
    }
    if (screen === "username") {
      void run(async () => { await claimUsername({ username: value("username").trim() || undefined }); },
        "Não foi possível salvar seu nome de usuário. Tente novamente.");
      return;
    }
    if (credentials) {
      const email = normalizeEmail(value("login"));
      const username = normalizeUsername(value("login"));
      const password = value("password");
      if (!email && (screen === "signUp" || !username)) {
        setError(screen === "signUp" ? "Informe um e-mail válido." : "Informe seu e-mail ou nome de usuário.");
        return;
      }
      if (screen === "signUp") {
        const requestedUsername = normalizeUsername(value("username"));
        if (!requestedUsername) {
          setError(USERNAME_HELP);
          return;
        }
        // Remember the chosen handle during email verification. The server
        // only reserves it after authentication, when ownership is confirmed.
        setPreferredUsername(requestedUsername);
      }
      void run(async () => {
        if (!email) {
          await signIn("username", { username: username!, password });
          return;
        }
        const { signingIn } = await signIn("password", { flow: screen, email, password });
        if (!signingIn) {
          setAddress(email);
          changeStep("verifyEmail");
        }
      }, screen === "signUp" ? "Não foi possível criar uma nova conta com este e-mail. Caso já esteja cadastrado, escolha Entrar ou Continuar com Google para acessar a conta existente. Não criamos outra conta." : "E-mail, nome de usuário ou senha incorretos. Confira os dados e tente novamente.");
      return;
    }
    if (screen === "resetRequest" || screen === "otpRequest") {
      const email = normalizeEmail(value("login"));
      if (!email) { setError("Informe um e-mail válido."); return; }
      void run(() => requestCode(screen, email), "Não foi possível enviar o código. Tente novamente.");
      return;
    }
    const code = value("code");
    void run(async () => {
      if (screen === "otpVerify") await signIn("email-otp", { email: address, code });
      else if (screen === "verifyEmail") await signIn("password", { flow: "email-verification", email: address, code });
      else await signIn("password", { flow: "reset-verification", email: address, code, newPassword: value("password") });
    }, "Código inválido ou expirado. Confira os seis dígitos ou solicite um novo código.");
  };

  const startGoogle = () => void run(async () => {
    await signIn("google", { redirectTo: "/auth?returnTo=" + encodeURIComponent(redirect) });
  }, "Não foi possível iniciar o login com Google. Tente novamente.");

  if (!isLoading && isAuthenticated && user?.username) return <Navigate to={redirect} replace />;
  const waiting = isLoading || methods === undefined;
  const emailUnavailable = methods?.emailDelivery === false && (needsEmail || hasCode);
  const descriptions = {
    signIn: "Entre para acessar seus dados financeiros.",
    signUp: "Confirme seu e-mail e escolha um nome de usuário para acessar sua conta.",
    username: "O nome de usuário é opcional. Deixe em branco para usar uma sugestão criada a partir do seu nome do Google ou e-mail.",
    switchAccount: "Use o Google ou um e-mail confirmado para continuar.",
    otpRequest: "Vamos enviar um código de seis dígitos para o seu e-mail.",
    verifyEmail: `Digite o código enviado para ${address}.`,
    otpVerify: `Digite o código enviado para ${address}.`,
    resetRequest: "Use o e-mail cadastrado com a sua senha.",
    resetVerify: `Digite o código de redefinição de ${address} e escolha a nova senha.`,
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <AppBackground />
      <section className="glass glass-strong relative z-10 w-full max-w-[460px] overflow-hidden rounded-[2rem] border border-white/60 p-6 sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#5b9dff]/20 blur-3xl" />
        <header className="relative text-center">
          <Link to="/" aria-label="Voltar para o início" className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5b9dff] to-[#5856d6] text-white">
            <Wallet className="size-7" strokeWidth={2.2} />
          </Link>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-[#2F6BFF]">Glass Finance</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-glass-ink">{waiting ? "Carregando sua conta…" : titles[screen]}</h1>
          {!waiting && <p className="mx-auto mt-2 max-w-[340px] text-sm leading-6 text-glass-sub">{descriptions[screen]}</p>}
        </header>

        {waiting ? <Loader2 role="status" aria-label="Carregando" className="mx-auto mt-6 size-5 animate-spin" /> : <>
          {credentials && <>
            <div className="relative mt-6 grid grid-cols-2 rounded-full border border-black/10 bg-white/45 p-1 dark:border-white/10">
              {(["signIn", "signUp"] as const).map(mode => (
                <button key={mode} type="button" disabled={busy} aria-pressed={mode === screen} onClick={() => changeStep(mode)}
                  className={`min-h-10 rounded-full px-4 text-sm font-semibold ${mode === screen ? "bg-[#2F6BFF] text-white" : "text-glass-sub hover:text-glass-ink"}`}>
                  {mode === "signIn" ? "Entrar" : "Criar conta"}
                </button>
              ))}
            </div>
            <button type="button" disabled={busy || !methods.google} onClick={startGoogle} className="relative mt-4 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
              <GoogleMark /> Continuar com Google
            </button>
            {!methods.google && <p className="mt-2 text-center text-xs text-glass-sub">O login com Google ainda não foi configurado.</p>}
            <div className="my-4 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-black/10" /><span className="text-xs text-glass-sub">ou</span><span className="h-px flex-1 bg-black/10" /></div>
          </>}
          <form key={screen} className="relative mt-4 space-y-4" onSubmit={onSubmit}>
            {(needsEmail || screen === "signIn") && <label className={labelClass}>
              <span>{screen === "signIn" ? "E-mail ou nome de usuário" : "E-mail"}</span>
              <Input name="login" type={screen === "signIn" ? "text" : "email"} autoComplete={screen === "signIn" ? "username" : "email"}
                autoCapitalize="none" spellCheck={false} defaultValue={address} required maxLength={254}
                placeholder={screen === "signIn" ? "Seu e-mail ou usuário" : "voce@exemplo.com"} className={inputClass} />
            </label>}
            {screen === "signUp" && <label className={labelClass}><span>Nome de usuário</span>
              <Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                pattern={USERNAME_PATTERN} minLength={3} maxLength={24} required
                defaultValue={preferredUsername} placeholder="Ex.: aline_silva"
                aria-describedby="signup-username-help" className={inputClass} />
              <span id="signup-username-help" className="block font-normal">
                {USERNAME_HELP} Confirmaremos a disponibilidade após verificar seu e-mail.
              </span>
            </label>}
            {hasCode && <label className={labelClass}><span>Código de 6 dígitos</span>
              <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" className={inputClass} />
            </label>}
            {hasPassword && <label className={labelClass}><span>{screen === "resetVerify" ? "Nova senha" : "Senha"}</span>
              <span className="relative block"><Input name="password" type={visible ? "text" : "password"} autoComplete={screen === "signIn" ? "current-password" : "new-password"}
                minLength={screen === "signIn" ? undefined : 8} maxLength={128} required placeholder={screen === "signIn" ? "Sua senha" : "De 8 a 128 caracteres"} className={inputClass + " pr-12"} />
                <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-2 px-2 text-glass-sub">
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </span>
            </label>}
            {screen === "username" && <label className={labelClass}><span>Nome de usuário (opcional)</span>
              <Input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} pattern={USERNAME_PATTERN}
                minLength={3} maxLength={24} defaultValue={preferredUsername}
                placeholder={suggestUsername(user?.name, user?.email)}
                aria-describedby="username-help" className={inputClass} />
              <span id="username-help" className="block font-normal">{USERNAME_HELP} Se deixar vazio, usaremos um nome disponível baseado em {user?.name ? "seu nome do Google" : "seu e-mail"}.</span>
            </label>}
            {emailUnavailable && <p role="status" className="text-sm text-glass-sub">O envio de códigos por e-mail ainda não foi configurado.</p>}
            {notice && <p role="status" className="text-sm text-glass-sub">{notice}</p>}
            {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
            <button type="submit" disabled={busy || emailUnavailable} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-4 font-semibold text-white disabled:opacity-60">
              {buttons[screen]} {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            </button>
          </form>
          <div className="relative mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-center">
            {screen === "signIn" && <div className="grid w-full gap-2">
              <button type="button" disabled={busy} onClick={() => changeStep("resetRequest")}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-[#2F6BFF]/25 bg-[#2F6BFF]/10 px-4 py-3 text-left text-sm font-semibold text-[#2055d5] shadow-sm transition-colors hover:border-[#2F6BFF]/60 hover:bg-[#2F6BFF]/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF] disabled:opacity-60 dark:text-[#aacaff]">
                <span>Esqueci minha senha</span><span className="inline-flex items-center gap-1 text-xs">Recuperar acesso <ArrowRight size={15} /></span>
              </button>
              <button type="button" disabled={busy} onClick={() => changeStep("otpRequest")}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-black/15 bg-white/80 px-4 py-3 text-left text-sm font-semibold text-glass-ink shadow-sm transition-colors hover:border-[#2F6BFF]/60 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF] disabled:opacity-60 dark:border-white/20 dark:bg-white/10">
                <span>Entrar com código por e-mail</span><ArrowRight size={17} className="shrink-0 text-[#2F6BFF]" />
              </button>
            </div>}
            {hasCode && <button type="button" disabled={busy || emailUnavailable} className={linkClass} onClick={() =>
              void run(() => requestCode(screen === "verifyEmail" ? "verifyEmail" : screen === "otpVerify" ? "otpRequest" : "resetRequest", address), "Não foi possível reenviar o código.")}>
              Reenviar código</button>}
            {!credentials && !isAuthenticated && <button type="button" disabled={busy} className={linkClass + " inline-flex items-center gap-1"} onClick={() => changeStep("signIn")}><ArrowLeft size={15} /> Voltar</button>}
            {screen === "username" && <button type="button" disabled={busy} className={linkClass} onClick={() => void run(signOut, "Não foi possível sair.")}>Usar outra conta</button>}
          </div>
        </>}
      </section>
    </main>
  );
}
