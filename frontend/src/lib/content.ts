import {
  Code2,
  Globe,
  Smartphone,
  Server,
  BarChart3,
  Megaphone,
  ShieldCheck,
  GraduationCap,
  Briefcase,
  Building2,
  School,
  Landmark,
  HeartPulse,
  Sprout,
  HandHeart,
  Store,
  type LucideIcon,
} from "lucide-react";

export const nav = [
  { to: "/about", label: "About" },
  { to: "/services", label: "Services" },
  { to: "/sectors", label: "Sectors" },
  { to: "/academy", label: "Academy" },
  { to: "/courses", label: "Courses" },
  { to: "/internships", label: "Internships" },
  { to: "/corporate", label: "Corporate" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/careers", label: "Careers" },
] as const;

export const pillars = [
  {
    icon: Code2,
    title: "Technology Solutions",
    text: "Software, websites, mobile apps, IT infrastructure and digital services.",
    to: "/services",
  },
  {
    icon: GraduationCap,
    title: "MDL Digital Academy",
    text: "Flexible, practical courses from computer basics to advanced technology.",
    to: "/academy",
  },
  {
    icon: Briefcase,
    title: "Internships",
    text: "Supervised academic and professional internships with real projects.",
    to: "/internships",
  },
  {
    icon: Building2,
    title: "Corporate & Institutional",
    text: "Tailored technology training and solutions for organizations.",
    to: "/corporate",
  },
] as const;

export type Service = { icon: LucideIcon; title: string; items: string[] };
export const services: Service[] = [
  {
    icon: Code2,
    title: "Software Development",
    items: [
      "Custom business systems",
      "School & institution management systems",
      "Inventory, POS and HR systems",
      "API development and integrations",
    ],
  },
  {
    icon: Globe,
    title: "Website Development",
    items: [
      "Corporate websites",
      "E-commerce stores",
      "Web portals and dashboards",
      "Maintenance and hosting support",
    ],
  },
  {
    icon: Smartphone,
    title: "Mobile App Development",
    items: [
      "Android and iOS apps",
      "Cross-platform apps",
      "App UI/UX design",
      "Publishing and support",
    ],
  },
  {
    icon: Server,
    title: "IT Support & Infrastructure",
    items: [
      "Network installation",
      "Hardware and software support",
      "Email and cloud setup",
      "Preventive maintenance",
    ],
  },
  {
    icon: BarChart3,
    title: "Data & Business Intelligence",
    items: [
      "Data collection tools",
      "Dashboards and reports",
      "Data cleaning and analysis",
      "Excel and Power BI solutions",
    ],
  },
  {
    icon: Megaphone,
    title: "Digital Marketing & Creative",
    items: [
      "Brand identity and graphics",
      "Social media management",
      "SEO and online visibility",
      "Video and multimedia",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Cybersecurity & Digital Safety",
    items: [
      "Security assessments",
      "Data protection guidance",
      "Staff awareness training",
      "Backup and recovery planning",
    ],
  },
];

export const sectors = [
  {
    icon: School,
    title: "Schools & Education",
    text: "Management systems, e-learning, ICT labs and teacher digital skills for schools, TVETs and universities.",
  },
  {
    icon: Store,
    title: "Businesses & SMEs",
    text: "Sales, inventory, accounting and online presence tools that simplify daily work.",
  },
  {
    icon: Landmark,
    title: "Government Institutions",
    text: "Digital service delivery, records management and staff capacity building.",
  },
  {
    icon: HeartPulse,
    title: "Healthcare",
    text: "Patient records, appointment systems and health data reporting.",
  },
  {
    icon: Sprout,
    title: "Agriculture",
    text: "Farmer registries, cooperative management and market information tools.",
  },
  {
    icon: HandHeart,
    title: "NGOs & Development",
    text: "Monitoring & evaluation tools, beneficiary databases and impact dashboards.",
  },
];

export const courseCategories = [
  {
    title: "Computer Fundamentals",
    courses: ["Introduction to Computers", "Typing & File Management", "Internet & Email"],
  },
  {
    title: "Office Productivity",
    courses: ["Microsoft Word", "Microsoft Excel", "PowerPoint & Presentations"],
  },
  { title: "Programming", courses: ["Python", "JavaScript", "Java", "C / C++"] },
  {
    title: "Web & Mobile Development",
    courses: ["HTML, CSS & JavaScript", "React", "Mobile App Development"],
  },
  { title: "Design & Multimedia", courses: ["Graphic Design", "UI/UX Design", "Video Editing"] },
  {
    title: "Data & Analytics",
    courses: ["Excel for Data Analysis", "Power BI", "Data Analysis with Python"],
  },
  {
    title: "Business & Digital Skills",
    courses: ["Digital Marketing", "Entrepreneurship & ICT", "Online Business"],
  },
  {
    title: "Advanced Technology",
    courses: ["Cybersecurity Basics", "Cloud Computing", "Artificial Intelligence Introduction"],
  },
];
export const allCourses = courseCategories.flatMap((c) => c.courses);

export const departments = [
  "Software Development",
  "Web Development",
  "Mobile Development",
  "IT Support & Networking",
  "Data & Analytics",
  "Graphic Design & Multimedia",
  "Digital Marketing",
  "Cybersecurity",
  "Training & Education",
  "Administration & Customer Service",
];

export const projects = [
  {
    title: "School Management System",
    sector: "Education",
    text: "Student records, fees, results and parent communication in one platform.",
  },
  {
    title: "Retail POS & Inventory",
    sector: "SMEs",
    text: "Point of sale with stock tracking and daily sales reports.",
  },
  {
    title: "Cooperative Member Registry",
    sector: "Agriculture",
    text: "Digital member records and contribution tracking for farmer cooperatives.",
  },
  {
    title: "NGO Impact Dashboard",
    sector: "NGOs",
    text: "Real-time monitoring of program indicators across districts.",
  },
  {
    title: "Clinic Appointment App",
    sector: "Healthcare",
    text: "Online booking and patient reminders for a private clinic.",
  },
  {
    title: "Corporate Excel Training",
    sector: "Corporate",
    text: "Hands-on data skills program for finance and admin staff.",
  },
];
