import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateAcademyContent } from "./content.validate.js";
import type { PreparedContent } from "./content.validate.js";

/** Default location of the authored academy content (backend/content/academy.json). */
export const ACADEMY_CONTENT_PATH = fileURLToPath(
  new URL("../../../content/academy.json", import.meta.url),
);

/** Reads and validates a content file. Throws ContentError listing every problem. */
export function loadAcademyContentSync(path: string = ACADEMY_CONTENT_PATH): PreparedContent {
  return validateAcademyContent(JSON.parse(readFileSync(path, "utf8")));
}
