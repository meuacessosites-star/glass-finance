import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const screenshotMode = import.meta.env.VITE_SCREENSHOT_MODE === "true";
  const user = useQuery(api.users.currentUser, screenshotMode ? "skip" : {});
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading: screenshotMode ? false : isLoading,
    isAuthenticated: screenshotMode ? true : isAuthenticated,
    user: screenshotMode ? ({ _id: 'demo-user', name: 'Demonstração' } as typeof user) : user,
    signIn,
    signOut,
  };
}
