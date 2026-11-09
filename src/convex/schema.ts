import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    people: defineTable({
      userSubject: v.string(),
      name: v.string(),
      nickname: v.optional(v.string()),
      phone: v.optional(v.string()),
      avatarType: v.optional(
        v.union(v.literal("letters"), v.literal("emoji"), v.literal("foto")),
      ),
      avatarValue: v.optional(v.string()),
      avatarColor: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user_subject", ["userSubject"]),

    financeStates: defineTable({
      userSubject: v.string(),
      revision: v.number(),
      chunkCount: v.number(),
      updatedAt: v.number(),
    }).index("by_user_subject", ["userSubject"]),

    financeStateChunks: defineTable({
      userSubject: v.string(),
      revision: v.number(),
      chunkIndex: v.number(),
      payload: v.string(),
    }).index("by_user_subject", ["userSubject"])
      .index("by_user_subject_revision", ["userSubject", "revision"]),

    // Push credentials are private per authenticated device; never expose
    // endpoints or encryption keys via public queries.
    pushDevices: defineTable({
      userSubject: v.string(),
      profileId: v.string(),
      endpoint: v.string(),
      p256dh: v.string(),
      auth: v.string(),
      timeZone: v.string(),
      enabled: v.boolean(),
      lastSentDay: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_endpoint", ["endpoint"])
      .index("by_user", ["userSubject"])
      .index("by_user_profile", ["userSubject", "profileId"]),

    // Stores only generic due dates and event kinds, not titles or amounts.
    // Each profile is replaced atomically when its finance data changes.
    pushSchedules: defineTable({
      userSubject: v.string(),
      profileId: v.string(),
      items: v.array(v.object({
        key: v.string(),
        date: v.string(),
        kind: v.union(v.literal("invoice"), v.literal("transaction"), v.literal("loan"), v.literal("review")),
      })),
      updatedAt: v.number(),
    }).index("by_user_profile", ["userSubject", "profileId"]),

    // Files are stored in Convex File Storage, not as base64 in financial JSON.
    // Never delete objects automatically while their references may exist.
    financeFiles: defineTable({
      userSubject: v.string(),
      profileId: v.string(),
      storageId: v.id("_storage"),
      fileName: v.string(),
      contentType: v.string(),
      byteSize: v.number(),
      linked: v.boolean(), // becomes true only after a financial save commits
      createdAt: v.number(),
    })
      .index("by_storage_id", ["storageId"])
      .index("by_owner_profile", ["userSubject", "profileId"])
      .index("by_owner_linked", ["userSubject", "linked"])
      .index("by_linked_created", ["linked", "createdAt"]),

    // Separately versioned metadata. Transaction history lives in financeTransactions
    // after a fully verified migration, and legacy snapshots remain untouched.
    financeV2States: defineTable({
      userSubject: v.string(),
      revision: v.number(),
      metadataPayload: v.string(),
      legacyRevision: v.number(),
      updatedAt: v.number(),
    }).index("by_user_subject", ["userSubject"]),

    // Preparação da migração: registros separados, ainda sem mudar a leitura/escrita legada.
    // Nunca ativar esta tabela como fonte principal antes da conferência por perfil.
    financeTransactions: defineTable({
      userSubject: v.string(),
      profileId: v.string(),
      ownerProfileKey: v.string(),
      ownerTransactionKey: v.string(),
      transactionId: v.string(),
      payload: v.any(),
      amountCents: v.number(),
      dateKey: v.string(),
      sourceRevision: v.number(),
      updatedAt: v.number(),
    })
      .index("by_owner", ["userSubject"])
      .index("by_owner_profile", ["ownerProfileKey"])
      .index("by_owner_profile_transaction", ["ownerTransactionKey"])
      .index("by_owner_profile_date", ["ownerProfileKey", "dateKey"]),

    financeMigrationProgress: defineTable({
      userSubject: v.string(),
      profileId: v.string(),
      sourceRevision: v.number(),
      expectedCount: v.number(),
      copiedCount: v.number(),
      expectedAmountCents: v.number(),
      copiedAmountCents: v.number(),
      status: v.union(v.literal("preparing"), v.literal("verified"), v.literal("stale")),
      updatedAt: v.number(),
    }).index("by_owner_profile", ["userSubject", "profileId"]),

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])
  },
  {
    schemaValidation: false,
  },
);

export default schema;
