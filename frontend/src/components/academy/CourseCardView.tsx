import { Link } from "@tanstack/react-router";
import { Clock, Layers } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { LEVEL_LABEL, formatDuration } from "@/lib/academy";
import type { CourseCard, EnrolmentView } from "@/lib/academy";

export function CourseCardView({
  course,
  enrolment,
}: {
  course: CourseCard;
  enrolment?: EnrolmentView;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        {course.category.name}
      </p>
      <h3 className="mt-2 text-lg font-bold text-primary">
        <Link to="/courses/$slug" params={{ slug: course.slug }} className="hover:underline">
          {course.title}
        </Link>
      </h3>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{course.summary}</p>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li>{LEVEL_LABEL[course.level]}</li>
        <li className="flex items-center gap-1">
          <Layers className="h-3.5 w-3.5" aria-hidden /> {course.stats.lessonCount} lessons
        </li>
        <li className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" aria-hidden />{" "}
          {formatDuration(course.stats.totalDurationSec)}
        </li>
      </ul>
      {enrolment ? (
        <div className="mt-4">
          <Progress value={enrolment.progress.percent} aria-label="Course progress" />
          <p className="mt-1 text-xs text-muted-foreground">
            {enrolment.status === "completed"
              ? "Completed"
              : `${enrolment.progress.percent}% complete`}
          </p>
        </div>
      ) : null}
    </article>
  );
}
