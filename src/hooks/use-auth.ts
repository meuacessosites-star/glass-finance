import { AuthAdapterContext } from "@/auth/auth-runtime";
import { api } from "@/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { useContext } from "react";

export function useAuth() {
  const adapter = useContext(AuthAdapterContext);
  if (!adapter) throw new Error("Um adaptador de autenticação precisa envolver o aplicativo.");
  const { isLoading: convexAuthLoading, isAuthenticated: convexAuthenticated } = useConvexAuth();
  const convexUser = useQuery(
    api.users.currentUser,
    adapter.mode === "convex" ? {} : "skip",
  );

  const user = adapter.mode === "firebase"
    ? adapter.firebaseUser
      ? {
          _id: adapter.firebaseUser.uid,
          name: adapter.firebaseUser.displayName ?? undefined,
          email: adapter.firebaseUser.email ?? undefined,
          image: adapter.firebaseUser.photoURL ?? undefined,
        }
      : null
    : convexUser;
  const isAuthenticated = adapter.mode === "firebase"
    ? Boolean(adapter.firebaseUser?.emailVerified) && convexAuthenticated
    : convexAuthenticated;
  const isLoading = adapter.mode === "firebase"
    ? adapter.firebaseLoading || convexAuthLoading
    : convexAuthLoading || convexUser === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn: adapter.signIn,
    signOut: adapter.signOut,
  };
}
