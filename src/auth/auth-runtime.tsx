import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import type { User } from "firebase/auth";
import { onIdTokenChanged, signOut as firebaseSignOut } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getFirebaseAuth } from "@/lib/firebase";

export type AppAuthMode = "convex" | "firebase";

type AuthAdapterValue = {
  mode: AppAuthMode;
  firebaseUser: User | null;
  firebaseLoading: boolean;
  signIn: (provider: string, data?: FormData) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthAdapterContext = createContext<AuthAdapterValue | null>(null);
const FirebaseUserContext = createContext<{
  user: User | null;
  loading: boolean;
} | null>(null);

export function useFirebaseUser() {
  const value = useContext(FirebaseUserContext);
  if (!value) throw new Error("FirebaseAuthRuntime não está montado.");
  return value;
}

function FirebaseUserStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onIdTokenChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);
  return (
    <FirebaseUserContext.Provider value={value}>
      {children}
    </FirebaseUserContext.Provider>
  );
}

function useFirebaseConvexAuth() {
  const { user, loading } = useFirebaseUser();
  const isAuthenticated = Boolean(user?.emailVerified);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean }) => {
      if (!user?.emailVerified) return null;
      return user.getIdToken(forceRefreshToken ?? false);
    },
    [user],
  );
  return useMemo(
    () => ({ isLoading: loading, isAuthenticated, fetchAccessToken }),
    [loading, isAuthenticated, fetchAccessToken],
  );
}

function FirebaseAuthActionsBridge({ children }: { children: ReactNode }) {
  const { user, loading } = useFirebaseUser();
  const signIn = useCallback(async () => {
    throw new Error("Use o formulário do Firebase para entrar.");
  }, []);
  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);
  const value = useMemo<AuthAdapterValue>(
    () => ({ mode: "firebase", firebaseUser: user, firebaseLoading: loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );
  return (
    <AuthAdapterContext.Provider value={value}>
      {children}
    </AuthAdapterContext.Provider>
  );
}

export function FirebaseAuthRuntime({
  client,
  children,
}: {
  client: ConvexReactClient;
  children: ReactNode;
}) {
  return (
    <FirebaseUserStateProvider>
      <ConvexProviderWithAuth client={client} useAuth={useFirebaseConvexAuth}>
        <FirebaseAuthActionsBridge>{children}</FirebaseAuthActionsBridge>
      </ConvexProviderWithAuth>
    </FirebaseUserStateProvider>
  );
}

export function LegacyAuthActionsBridge({ children }: { children: ReactNode }) {
  const { signIn: convexSignIn, signOut: convexSignOut } = useAuthActions();
  const signIn = useCallback(
    async (provider: string, data?: FormData) => {
      await convexSignIn(provider, data);
    },
    [convexSignIn],
  );
  const signOut = useCallback(async () => {
    await convexSignOut();
  }, [convexSignOut]);
  const value = useMemo<AuthAdapterValue>(
    () => ({ mode: "convex", firebaseUser: null, firebaseLoading: false, signIn, signOut }),
    [signIn, signOut],
  );
  return (
    <AuthAdapterContext.Provider value={value}>
      {children}
    </AuthAdapterContext.Provider>
  );
}
