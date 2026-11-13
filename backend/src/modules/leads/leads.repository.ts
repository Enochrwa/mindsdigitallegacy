import { LeadModel } from "./leads.model.js";
import type { NewLead } from "./leads.model.js";

/** Persistence port. The service depends on this interface, which keeps tests free of a database. */
export interface LeadRepository {
  create(lead: NewLead): Promise<void>;
}

export function createMongoLeadRepository(): LeadRepository {
  return {
    async create(lead) {
      await LeadModel.create(lead);
    },
  };
}
