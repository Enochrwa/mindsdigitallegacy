import { PRIVACY_NOTICE_VERSION } from "./api";

/**
 * Maps each website form to the API's lead schema (backend/src/modules/leads/leads.schema.ts).
 * The API is strict: unknown fields are rejected and optional fields must be omitted when empty,
 * so this is the one place that translates form fields into the exact payload.
 */

export type FormKey = "contact" | "academy" | "internships" | "services" | "careers" | "corporate";
export type Values = Record<string, string | undefined>;

/** Forms whose lead kind records age (guardian rule for applicants under 16). */
export const AGE_FORMS: ReadonlySet<FormKey> = new Set(["academy", "internships"]);

/** Per-field length caps so composed messages always fit the API limits (no silent truncation). */
export const FIELD_LIMITS: Record<FormKey, Record<string, number>> = {
  contact: { message: 1800 },
  academy: { notes: 600 },
  internships: { institution: 120, program: 120, motivation: 500 },
  services: { organization: 120, budget: 50, details: 2000 },
  careers: { portfolio: 150, about: 1700 },
  corporate: { organization: 120, participants: 30, details: 1700 },
};

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
};

const compose = (lines: [label: string, value: string | undefined][], tail?: string): string =>
  [
    ...lines.flatMap(([label, value]) =>
      clean(value) === undefined ? [] : [`${label}: ${clean(value)}`],
    ),
    clean(tail),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

function omitEmpty(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && v !== ""));
}

export interface Submission {
  values: Values;
  ageBracket?: "under_16" | "16_plus" | undefined;
  guardianContact?: string | undefined;
  /** Honeypot: real users never fill it. Sent so the server can discard bots silently. */
  website?: string | undefined;
}

export function toLeadPayload(form: FormKey, s: Submission): Record<string, unknown> {
  const v = s.values;
  const common = {
    fullName: clean(v["fullName"]),
    email: clean(v["email"]),
    phone: clean(v["phone"]),
    consent: true,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    website: clean(s.website),
  };
  const age = { ageBracket: s.ageBracket, guardianContact: clean(s.guardianContact) };

  switch (form) {
    case "contact":
      return omitEmpty({
        kind: "contact",
        ...common,
        message: compose([["Subject", v["subject"]]], v["message"]),
      });
    case "careers":
      return omitEmpty({
        kind: "contact",
        ...common,
        message: compose(
          [
            ["Career interest", v["area"]],
            ["Portfolio", v["portfolio"]],
          ],
          v["about"],
        ),
      });
    case "services":
      return omitEmpty({
        kind: "service_request",
        ...common,
        organization: clean(v["organization"]),
        service: clean(v["service"]),
        budget: clean(v["budget"]),
        message: clean(v["details"]),
      });
    case "corporate":
      return omitEmpty({
        kind: "partner_inquiry",
        ...common,
        organization: clean(v["organization"]),
        partnerType: clean(v["sector"]),
        message: compose(
          [
            ["Training area", v["topic"]],
            ["Participants", v["participants"]],
          ],
          v["details"],
        ),
      });
    case "academy":
      return omitEmpty({
        kind: "course_interest",
        ...common,
        ...age,
        interest: clean(v["course"]),
        message: compose(
          [
            ["Mode", v["mode"]],
            ["Level", v["level"]],
          ],
          v["notes"],
        ),
      });
    case "internships":
      return omitEmpty({
        kind: "internship_interest",
        ...common,
        ...age,
        interest: compose([], `${clean(v["department"]) ?? ""} (${clean(v["type"]) ?? ""})`),
        message: compose(
          [
            ["Institution", v["institution"]],
            ["Field of study", v["program"]],
            ["Duration", v["duration"]],
          ],
          v["motivation"],
        ),
      });
  }
}
