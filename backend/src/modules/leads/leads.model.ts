import { Schema, model } from "mongoose";
import { AGE_BRACKETS, LEAD_KINDS } from "./leads.schema.js";
import type { LeadKind } from "./leads.schema.js";

export interface NewLead {
  kind: LeadKind;
  fullName: string;
  email: string;
  phone?: string | undefined;
  organization?: string | undefined;
  message?: string | undefined;
  service?: string | undefined;
  budget?: string | undefined;
  partnerType?: string | undefined;
  interest?: string | undefined;
  ageBracket?: (typeof AGE_BRACKETS)[number] | undefined;
  guardianContact?: string | undefined;
  consent: { privacyNoticeVersion: string; acceptedAt: Date };
  /** Record is deleted automatically after this date (TTL index). Data minimisation by design. */
  retainUntil: Date;
}

export type LeadStatus = "new" | "contacted" | "closed";

const leadSchema = new Schema(
  {
    kind: { type: String, enum: LEAD_KINDS, required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    organization: { type: String, trim: true, maxlength: 120 },
    message: { type: String, trim: true, maxlength: 2000 },
    service: { type: String, trim: true, maxlength: 100 },
    budget: { type: String, trim: true, maxlength: 50 },
    partnerType: { type: String, trim: true, maxlength: 60 },
    interest: { type: String, trim: true, maxlength: 100 },
    ageBracket: { type: String, enum: AGE_BRACKETS },
    guardianContact: { type: String, trim: true, maxlength: 150 },
    consent: {
      privacyNoticeVersion: { type: String, required: true, maxlength: 20 },
      acceptedAt: { type: Date, required: true },
    },
    status: { type: String, enum: ["new", "contacted", "closed"], default: "new" },
    retainUntil: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

leadSchema.index({ createdAt: -1 });
leadSchema.index({ kind: 1, status: 1, createdAt: -1 });
leadSchema.index({ email: 1, createdAt: -1 });
// expireAfterSeconds: 0 means "delete at the time stored in retainUntil".
leadSchema.index({ retainUntil: 1 }, { expireAfterSeconds: 0 });

export const LeadModel = model("Lead", leadSchema);
