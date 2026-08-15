/**
 * Runtime and type-safe server builders for this Convex project.
 *
 * Convex normally generates this file from the active deployment. The generic
 * builders preserve the same public API while allowing CI and Vercel to run
 * TypeScript without a local `convex dev` process.
 */
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type {
  ActionBuilder,
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";

export const query: QueryBuilder<GenericDataModel, "public"> = queryGeneric;
export const internalQuery: QueryBuilder<GenericDataModel, "internal"> =
  internalQueryGeneric;
export const mutation: MutationBuilder<GenericDataModel, "public"> =
  mutationGeneric;
export const internalMutation: MutationBuilder<GenericDataModel, "internal"> =
  internalMutationGeneric;
export const action: ActionBuilder<GenericDataModel, "public"> = actionGeneric;
export const internalAction: ActionBuilder<GenericDataModel, "internal"> =
  internalActionGeneric;
export const httpAction: HttpActionBuilder = httpActionGeneric;

export type QueryCtx = GenericQueryCtx<GenericDataModel>;
export type MutationCtx = GenericMutationCtx<GenericDataModel>;
export type ActionCtx = GenericActionCtx<GenericDataModel>;
