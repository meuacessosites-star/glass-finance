import { AppBackground } from "@/components/app/AppBackground";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { appAuthMode, firebaseAuthEnabledByDefault } from "@/auth/auth-mode";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Mail, Wallet } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

type AuthMode = "signIn" | "signUp";
type FirebaseAuthPageProps = { redirectAfterAuth?: string };

function safeRedirect(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function firebaseErrorMessage(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "auth/email-already-in-use") return "Esse e-mail já tem uma conta. Tente entrar em vez de criar outra.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
  if (code === "auth/weak-password") return "Escolha uma senha com pelo menos 8 caracteres.";
  if (code === "auth/email-not-verified") return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (code === "auth/account-exists-with-different-credential") return "Esse e-mail já está associado a outra forma de login. Entre usando o método que escolheu primeiro.";
  if (code === "auth/popup-closed-by-user") return "A janela do Google foi fechada antes de concluir o acesso.";
  if (code === "auth/too-many-requests") return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  if (code === "auth/unauthorized-domain") return "Este endereço do site ainda não está autorizado no Firebase.";
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}

export default function FirebaseAuthPage({ redirectAfterAuth = "/dashboard" }: FirebaseAuthPageProps) {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirect(searchParams.get("returnTo"), redirectAfterAuth);
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [showReset, setShowReset] = useState(false);
  const [email, setEmail] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("emailVerified") === "1" ? "E-mail confirmado. Agora entre com sua senha." : null,
  );

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate(redirect, { replace: true });
  }, [isLoading, isAuthenticated, navigate, redirect]);

  const handlePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const normalizedEmail = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    setEmail(normalizedEmail);
    const auth = getFirebaseAuth();

    try {
      if (mode === "signUp") {
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        try {
          await sendEmailVerification(credential.user, {
            url: `${window.location.origin}/auth?emailVerified=1`,
            handleCodeInApp: false,
          });
        } finally {
          await signOut(auth);
        }
        setNotice("Conta criada. Abra o link de confirmação que enviamos ao seu e-mail. Depois volte aqui para entrar.");
        return;
      }

      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user, {
          url: `${window.location.origin}/auth?emailVerified=1`,
          handleCodeInApp: false,
        });
        await signOut(auth);
        setNotice("Confirme seu e-mail pelo link enviado. Enviamos uma nova mensagem para você.");
        return;
      }
      navigate(redirect, { replace: true });
    } catch (authError) {
      setError(firebaseErrorMessage(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(getFirebaseAuth(), provider);
      navigate(redirect, { replace: true });
    } catch (authError) {
      setError(firebaseErrorMessage(authError));
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const normalizedEmail = String(form.get("email") ?? "").trim().toLowerCase();
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), normalizedEmail, {
        url: `${window.location.origin}/auth`,
        handleCodeInApp: false,
      });
    } catch {
      // Keep the response neutral so the page does not disclose registered addresses.
    } finally {
      setEmail(normalizedEmail);
      setNotice("Se a conta existir, você receberá um e-mail com as instruções para redefinir a senha.");
      setIsSubmitting(false);
    }
  };

  const title = showReset ? "Recuperar acesso" : mode === "signUp" ? "Crie sua conta" : "Acesse sua conta";
  const description = showReset
    ? "Enviaremos um link seguro para redefinir sua senha."
    : mode === "signUp"
      ? "Seus dados ficam vinculados à sua conta e podem ser sincronizados entre dispositivos."
      : "Entre para acessar seus dados financeiros.";

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

          {!showReset && (
            <>
              <div className="relative mt-6 grid grid-cols-2 rounded-full border border-black/10 bg-white/45 p-1 dark:border-white/10">
                {(["signIn", "signUp"] as const).map((value) => (
                  <button key={value} type="button" onClick={() => { setMode(value); setError(null); setNotice(null); }} className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${mode === value ? "bg-[#2F6BFF] text-white" : "text-glass-sub hover:text-glass-ink"}`}>
                    {value === "signIn" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void handleGoogle()} disabled={isSubmitting} className="relative mt-4 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <span aria-hidden="true" className="font-bold text-[#4285F4]">G</span>}
                Continuar com Google
              </button>
              <div className="relative my-5 flex items-center gap-3"><span className="h-px flex-1 bg-black/10 dark:bg-white/15"/><span className="text-[11px] font-semibold uppercase tracking-wider text-glass-faint">ou use seu e-mail</span><span className="h-px flex-1 bg-black/10 dark:bg-white/15"/></div>
            </>
          )}

          {showReset ? (
            <form onSubmit={(event) => void handlePasswordReset(event)} className="relative mt-7 space-y-4">
              <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>E-mail da sua conta</span><Input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="h-12 rounded-xl bg-white/60"/></label>
              {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
              {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
              <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] font-semibold text-white disabled:opacity-60">{isSubmitting ? <Loader2 className="size-4 animate-spin"/> : "Enviar instruções"}</button>
              <button type="button" onClick={() => { setShowReset(false); setError(null); setNotice(null); }} className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-glass-sub hover:text-glass-ink"><ArrowLeft className="size-4"/>Voltar para entrar</button>
            </form>
          ) : (
            <form onSubmit={(event) => void handlePassword(event)} className="relative space-y-3">
              <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>E-mail</span><span className="relative block"><Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-glass-faint"/><Input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" className="h-12 rounded-xl border-black/10 bg-white/60 pl-10 dark:border-white/15 dark:bg-black/10" /></span></label>
              <label className="block space-y-1.5 text-xs font-semibold text-glass-sub"><span>Senha</span><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-glass-faint"/><Input name="password" type={passwordVisible ? "text" : "password"} autoComplete={mode === "signUp" ? "new-password" : "current-password"} minLength={8} required placeholder="Mínimo de 8 caracteres" className="h-12 rounded-xl border-black/10 bg-white/60 pl-10 pr-12 dark:border-white/15 dark:bg-black/10"/><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Ocultar senha" : "Mostrar senha"} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-glass-faint hover:text-glass-ink">{passwordVisible ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}</button></span></label>
              {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
              {notice && <p role="status" className="text-sm font-medium text-emerald-700">{notice}</p>}
              <button type="submit" disabled={isSubmitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2F6BFF] px-4 text-sm font-semibold text-white transition-all hover:bg-[#2458df] disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? <Loader2 className="size-4 animate-spin"/> : <>{mode === "signUp" ? "Criar conta" : "Entrar"}<ArrowRight className="size-4"/></>}
              </button>
              {mode === "signIn" && <button type="button" onClick={() => { setShowReset(true); setError(null); setNotice(null); }} className="w-full pt-1 text-center text-sm font-semibold text-[#2F6BFF] hover:underline">Esqueci minha senha</button>}
            </form>
          )}

          <p className="mx-auto mt-5 max-w-[390px] text-center text-xs leading-5 text-glass-sub">A senha é gerenciada pelo Firebase. Seus dados financeiros continuam armazenados no Convex.</p>
          {appAuthMode === "firebase" && (
            <a href="/auth?auth=legacy" className="mt-4 block text-center text-xs font-medium text-glass-sub underline hover:text-glass-ink">Acessar temporariamente minha conta antiga</a>
          )}
          {firebaseAuthEnabledByDefault && appAuthMode === "convex" && (
            <a href="/auth?auth=firebase" className="mt-4 block text-center text-xs font-medium text-glass-sub underline hover:text-glass-ink">Usar a nova autenticação Firebase</a>
          )}
        </div>
      </section>
    </main>
  );
}
