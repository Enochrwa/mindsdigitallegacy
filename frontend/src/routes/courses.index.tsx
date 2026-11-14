import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHero } from "@/components/site/Layout";
import { CourseCardView } from "@/components/academy/CourseCardView";
import { LEVEL_LABEL, academyApi } from "@/lib/academy";
import type { Level } from "@/lib/academy";
import { failureText } from "@/components/auth/helpers";

export const Route = createFileRoute("/courses/")({
  head: () => ({
    meta: [
      { title: "Courses | Minds Digital Legacy" },
      {
        name: "description",
        content: "Free, practical digital skills courses you can take at your own pace.",
      },
    ],
  }),
  component: CataloguePage,
});

function CataloguePage() {
  const [category, setCategory] = useState<string>("");
  const [level, setLevel] = useState<Level | "">("");
  const query = useQuery({
    queryKey: ["catalogue", category, level],
    queryFn: async () => {
      const r = await academyApi.catalogue({
        ...(category ? { category } : {}),
        ...(level ? { level } : {}),
      });
      if (!r.ok) throw new Error(r.reason);
      return r.data;
    },
  });
  const select = "rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <>
      <PageHero
        eyebrow="MDL Digital Academy"
        title="Courses"
        text="Start with the basics or pick up a new skill. Read at your own pace, on any phone."
      />
      <section className="container-mdl py-12">
        <div className="mb-8 flex flex-wrap gap-4">
          <label className="text-sm">
            <span className="mr-2 font-medium">Topic</span>
            <select
              className={select}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All topics</option>
              {query.data?.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mr-2 font-medium">Level</span>
            <select
              className={select}
              value={level}
              onChange={(e) => setLevel(e.target.value as Level | "")}
            >
              <option value="">All levels</option>
              {(Object.keys(LEVEL_LABEL) as Level[]).map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {query.isPending ? (
          <p role="status" className="text-muted-foreground">
            Loading courses…
          </p>
        ) : null}
        {query.isError ? (
          <p role="alert" className="text-destructive">
            {failureText(query.error.message)}
          </p>
        ) : null}
        {query.data && query.data.courses.length === 0 ? (
          <p className="text-muted-foreground">
            No courses match these filters yet. More are on the way.
          </p>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {query.data?.courses.map((c) => (
            <CourseCardView key={c.slug} course={c} />
          ))}
        </div>
      </section>
    </>
  );
}
