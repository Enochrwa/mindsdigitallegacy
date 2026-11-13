import type { NewLead } from "./leads.model.js";
import type { LeadRepository } from "./leads.repository.js";
import type { LeadInput } from "./leads.schema.js";

export interface LeadService {
  /**
   * Stores a validated lead. Returns normally in every non-error case, including honeypot hits, so
   * callers (and attackers) cannot tell a discarded submission from a stored one, and cannot learn
   * whether an email address was already known.
   */
  submit(input: LeadInput): Promise<void>;
}

interface Deps {
  repository: LeadRepository;
  retentionDays: number;
  now?: () => Date;
}

/** Fields that exist only for some kinds of lead. Exhaustive: adding a kind is a compile error here. */
function kindFields(input: LeadInput): Partial<NewLead> {
  switch (input.kind) {
    case "contact":
      return { message: input.message };
    case "service_request":
      return { service: input.service, budget: input.budget, message: input.message };
    case "partner_inquiry":
      return { partnerType: input.partnerType, message: input.message };
    case "course_interest":
    case "internship_interest":
      return {
        interest: input.interest,
        ageBracket: input.ageBracket,
        guardianContact: input.guardianContact,
        message: input.message,
      };
  }
}

export function createLeadService({ repository, retentionDays, now = () => new Date() }: Deps) {
  const service: LeadService = {
    async submit(input) {
      if (input.website !== undefined && input.website.length > 0) return; // honeypot

      const acceptedAt = now();
      const retainUntil = new Date(acceptedAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);

      await repository.create({
        kind: input.kind,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        organization: input.organization,
        ...kindFields(input),
        consent: { privacyNoticeVersion: input.privacyNoticeVersion, acceptedAt },
        retainUntil,
      });
    },
  };
  return service;
}
