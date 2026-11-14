import { request } from "./api";

/** Shapes returned by /api/v1/courses and /api/v1/learning (see backend courses.dto.ts). */
export type Level = "beginner" | "intermediate" | "advanced";

export type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered?: boolean; items: string[] }
  | { type: "note"; tone?: "tip" | "warning" | "info"; text: string }
  | { type: "code"; language?: string; text: string };

export interface CourseCard {
  slug: string;
  title: string;
  summary: string;
  level: Level;
  language: "en" | "rw" | "fr";
  category: { slug: string; name: string };
  tags: string[];
  instructors: { name: string; role?: string }[];
  stats: { lessonCount: number; totalDurationSec: number };
  unlockPolicy: { type: "open" | "referral" | "code"; threshold?: number };
}

export interface OutlineLesson {
  slug: string;
  title: string;
  summary: string;
  kind: "video" | "reading";
  required: boolean;
  isPreview: boolean;
  durationSec?: number;
}

export interface CourseDetail extends CourseCard {
  description: ContentBlock[];
  outcomes: string[];
  audience: string;
  prerequisites: { slug: string; title: string }[];
  sections: { title: string; summary?: string; lessons: OutlineLesson[] }[];
}

export interface Lesson extends OutlineLesson {
  body: ContentBlock[];
  transcript?: { language: string; paragraphs: string[] };
  resources: { title: string; url: string }[];
  video?: { provider: "youtube"; videoId: string; durationSec: number };
  canTrackProgress: boolean;
  course: { slug: string; title: string };
  position: { index: number; total: number };
  previous?: { slug: string; title: string };
  next?: { slug: string; title: string };
  progress?: { status: "in_progress" | "completed"; positionSec?: number; completedAt?: string };
}

export interface EnrolmentView {
  status: "active" | "completed" | "withdrawn";
  access: { state: "locked" | "unlocked"; via?: string };
  enrolledAt: string;
  completedAt?: string;
  progress: { completedRequired: number; requiredTotal: number; percent: number };
  continueLesson?: { slug: string; title: string };
}

export const academyApi = {
  catalogue: (query: { category?: string; level?: Level } = {}) => {
    const params = new URLSearchParams();
    if (query.category) params.set("category", query.category);
    if (query.level) params.set("level", query.level);
    const qs = params.toString();
    return request<{
      categories: { slug: string; name: string; description: string }[];
      courses: CourseCard[];
    }>("GET", `/courses${qs ? `?${qs}` : ""}`);
  },
  course: (slug: string) => request<{ course: CourseDetail }>("GET", `/courses/${slug}`),
  enrolment: (slug: string) =>
    request<{ enrolment: EnrolmentView | null }>("GET", `/courses/${slug}/enrolment`),
  enrol: (slug: string) =>
    request<{ enrolment: EnrolmentView }>("POST", `/courses/${slug}/enrol`, {}),
  withdraw: (slug: string) => request<undefined>("DELETE", `/courses/${slug}/enrol`),
  lesson: (slug: string, lessonSlug: string) =>
    request<{ lesson: Lesson }>("GET", `/courses/${slug}/lessons/${lessonSlug}`),
  saveProgress: (slug: string, lessonSlug: string, body: { completed: boolean }) =>
    request<{ enrolment: EnrolmentView }>(
      "PUT",
      `/courses/${slug}/lessons/${lessonSlug}/progress`,
      body,
    ),
  learning: () =>
    request<{ items: { course: CourseCard; enrolment: EnrolmentView }[] }>("GET", "/learning"),
};

export function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return "Self-paced reading";
  const minutes = Math.max(1, Math.round(totalSec / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
