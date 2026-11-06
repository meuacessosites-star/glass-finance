import type { AuthConfig } from "convex/server";

// Only the first-party Convex Auth session issuer is trusted by this finance
// application. External federated issuers are not required for Google OAuth
// or password/email login and must never bypass the app's account isolation.
export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
