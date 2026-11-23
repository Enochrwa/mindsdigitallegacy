import type { Department } from "./internships.types.js";

/** Words for each department, used for search and emails. The website has its own copy for display. */
export const DEPARTMENT_LABELS: Record<Department, string> = {
  software_web: "Software and web development",
  mobile: "Mobile application development",
  it_support: "IT support and networking",
  cyber_awareness: "Cybersecurity awareness and defensive IT",
  data_bi: "Data analysis and business intelligence",
  design: "UI/UX and graphic design",
  marketing_content: "Digital marketing and content",
  business_admin: "Business administration and customer relations",
  project_ops: "Project management and operations",
  research_education: "Research, innovation and digital education",
};
