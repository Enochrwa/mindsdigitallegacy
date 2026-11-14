import { ConfigError, loadEnv } from "../config/env.js";
import { closeDb, connectDb } from "../db/connect.js";
import { importAcademyContent } from "../modules/courses/content.import.js";
import { ACADEMY_CONTENT_PATH, loadAcademyContentSync } from "../modules/courses/content.load.js";
import { ContentError } from "../modules/courses/content.validate.js";

/**
 * Usage:
 *   npm run check:academy                 validate content/academy.json only (no database)
 *   npm run seed:academy                  validate, then import into MONGODB_URI (idempotent)
 *   npm run seed:academy -- path/to.json  use another content file
 * Output is plain text on purpose: this is run by people, not shipped as a service.
 */
/* eslint-disable no-console */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const file = args.find((a) => !a.startsWith("--")) ?? ACADEMY_CONTENT_PATH;

  const prepared = loadAcademyContentSync(file);
  const lessons = prepared.courses.reduce((n, c) => n + c.stats.lessonCount, 0);
  console.log(
    `content OK: ${prepared.categories.length} categories, ${prepared.courses.length} courses, ${lessons} published lessons`,
  );
  if (checkOnly) return;

  const env = loadEnv();
  if (env.MONGODB_URI === undefined) throw new ConfigError(["MONGODB_URI is required to import"]);
  await connectDb(env.MONGODB_URI);
  try {
    const report = await importAcademyContent(prepared, new Date());
    console.log("import report:", JSON.stringify(report, null, 2));
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  if (err instanceof ContentError) console.error(err.message);
  else console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
