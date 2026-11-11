/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiVision from "../aiVision.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as financeOwnership from "../financeOwnership.js";
import type * as financeState from "../financeState.js";
import type * as financeV2 from "../financeV2.js";
import type * as financeFiles from "../financeFiles.js";
import type * as pushNotifications from "../pushNotifications.js";
import type * as pushDelivery from "../pushDelivery.js";
import type * as webPushCrypto from "../webPushCrypto.js";
import type * as transactionMigration from "../transactionMigration.js";
import type * as http from "../http.js";
import type * as people from "../people.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiVision: typeof aiVision;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  financeOwnership: typeof financeOwnership;
  financeState: typeof financeState;
  financeV2: typeof financeV2;
  financeFiles: typeof financeFiles;
  pushNotifications: typeof pushNotifications;
  pushDelivery: typeof pushDelivery;
  webPushCrypto: typeof webPushCrypto;
  transactionMigration: typeof transactionMigration;
  http: typeof http;
  people: typeof people;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
