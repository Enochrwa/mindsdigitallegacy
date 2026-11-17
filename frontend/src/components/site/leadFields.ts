import type { Field } from "./LeadForm";

export const contactBasics: Field[] = [
  { name: "fullName", label: "Full name", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel", required: true },
];
