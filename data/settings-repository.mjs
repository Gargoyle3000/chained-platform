import { FRONTEND_MODES } from "../auth/config.mjs";
import { getFrontendRuntime } from "../auth/supabase-client.mjs";
import { normalizeHttpUrl } from "./url-normalization.mjs";

const PROFILE_SELECT = [
  "id",
  "slug",
  "display_name",
  "alternative_name",
  "city",
  "country",
  "biography",
  "website_url",
  "social_url",
  "pronouns",
  "public_contact_email",
  "publication_status",
  "show_works",
  "show_presentations",
  "show_agenda",
  "show_cv",
  "show_press",
  "updated_at"
].join(",");

function requireResult(error, data, message) {
  if (error) {
    throw new Error(
      error.message || message
    );
  }

  return data;
}

function clean(value) {
  return String(value ?? "").trim();
}

function nullable(value) {
  const cleaned = clean(value);
  return cleaned || null;
}

function databaseToProfile(row) {
  return Object.freeze({
    id: row.id,
    slug: row.slug,
    name: row.display_name,
    displayName: row.display_name,
    alternativeName: row.alternative_name || "",
    city: row.city || "",
    country: row.country || "",
    biography: row.biography || "",
    websiteUrl: row.website_url || "",
    socialUrl: row.social_url || "",
    pronouns: row.pronouns || "",
    publicContactEmail:
      row.public_contact_email || "",
    publicationStatus:
      row.publication_status,
    showWorks: row.show_works !== false,
    showPresentations:
      row.show_presentations !== false,
    showAgenda: row.show_agenda !== false,
    showCv: row.show_cv !== false,
    showPress: row.show_press !== false,
    updatedAt: row.updated_at
  });
}

function createPrototypeRepository() {
  return Object.freeze({
    mode: FRONTEND_MODES.PROTOTYPE,
    initialise: async () => {},
    listManagedProfiles: async () => [],
    getAccountSettings: async () => null,

    async updateProfileSettings() {
      throw new Error(
        "SETTINGS ARE CURRENTLY UNAVAILABLE"
      );
    }
  });
}

function createSupabaseRepository(client) {
  return Object.freeze({
    mode: FRONTEND_MODES.SUPABASE,

    initialise: async () => {},

    async getAccountSettings() {
      const {
        data: userData,
        error: userError
      } = await client.auth.getUser();

      if (userError || !userData?.user) {
        throw new Error(
          "ACCOUNT INFORMATION IS UNAVAILABLE"
        );
      }

      const {
        data,
        error
      } = await client
        .from("accounts")
        .select(
          "status,account_plan,legacy_status"
        )
        .eq("id", userData.user.id)
        .maybeSingle();

      requireResult(
        error,
        data,
        "ACCOUNT INFORMATION IS UNAVAILABLE"
      );

      if (!data) {
        throw new Error(
          "ACCOUNT INFORMATION IS UNAVAILABLE"
        );
      }

      return Object.freeze({
        email: userData.user.email || "",
        status: data.status || "",
        plan: data.account_plan || "unchained",
        legacyStatus:
          data.legacy_status || null
      });
    },

    async listManagedProfiles() {
      const {
        data: userData,
        error: userError
      } = await client.auth.getUser();

      if (userError || !userData?.user) {
        throw new Error(
          "ARTIST PROFILES ARE UNAVAILABLE"
        );
      }

      const {
        data: memberships,
        error: membershipError
      } = await client
        .from("profile_members")
        .select(
          "profile_id,membership_level,status,revoked_at"
        )
        .eq("account_id", userData.user.id)
        .eq("status", "active")
        .is("revoked_at", null)
        .in(
          "membership_level",
          ["owner", "manager"]
        );

      const allowed =
        requireResult(
          membershipError,
          memberships,
          "PROFILE SETTINGS ARE UNAVAILABLE"
        ) || [];

      const profileIds = [
        ...new Set(
          allowed.map(
            (row) => row.profile_id
          )
        )
      ];

      if (!profileIds.length) {
        return [];
      }

      const {
        data,
        error
      } = await client
        .from("public_profiles")
        .select(PROFILE_SELECT)
        .in("id", profileIds)
        .eq("profile_type", "artist")
        .order(
          "display_name",
          { ascending: true }
        )
        .order("id", { ascending: true });

      return (
        requireResult(
          error,
          data,
          "PROFILE SETTINGS ARE UNAVAILABLE"
        ) || []
      ).map(databaseToProfile);
    },

    async updateProfileSettings(
      record,
      expectedUpdatedAt
    ) {
      if (!record?.id) {
        throw new Error(
          "PROFILE SETTINGS ARE INVALID"
        );
      }

      if (!expectedUpdatedAt) {
        throw new Error(
          "PROFILE SETTINGS NEED TO BE RELOADED"
        );
      }

      const payload = {
        display_name:
          clean(record.displayName),

        alternative_name:
          nullable(record.alternativeName),

        city:
          nullable(record.city),

        country:
          nullable(record.country),

        biography:
          nullable(record.biography),

        website_url:
          normalizeHttpUrl(record.websiteUrl, null),

        social_url:
          normalizeHttpUrl(record.socialUrl, null),

        pronouns:
          nullable(record.pronouns),

        public_contact_email:
          nullable(
            record.publicContactEmail
          ),

        publication_status:
          record.publicationStatus ===
            "published"
            ? "published"
            : "draft",

        show_works:
          Boolean(record.showWorks),

        show_presentations:
          Boolean(
            record.showPresentations
          ),

        show_agenda:
          Boolean(record.showAgenda),

        show_cv:
          Boolean(record.showCv),

        show_press:
          Boolean(record.showPress)
      };

      const {
        data,
        error
      } = await client
        .from("public_profiles")
        .update(payload)
        .eq("id", record.id)
        .eq(
          "updated_at",
          expectedUpdatedAt
        )
        .select(PROFILE_SELECT)
        .maybeSingle();

      requireResult(
        error,
        data,
        "PROFILE SETTINGS COULD NOT BE SAVED"
      );

      if (!data) {
        throw new Error(
          "PROFILE SETTINGS CHANGED ELSEWHERE — PLEASE RELOAD"
        );
      }

      return databaseToProfile(data);
    }
  });
}

export async function getSettingsRepository() {
  const runtime =
    await getFrontendRuntime();

  if (
    runtime.mode ===
    FRONTEND_MODES.PROTOTYPE
  ) {
    return Object.freeze({
      runtime,
      repository:
        createPrototypeRepository()
    });
  }

  return Object.freeze({
    runtime,
    repository:
      createSupabaseRepository(
        runtime.client
      )
  });
}
