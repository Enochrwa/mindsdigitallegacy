import type { Model } from "mongoose";

/**
 * Returns the filter exactly as Mongoose will send it to MongoDB with `sanitizeFilter` on (as in production).
 * With sanitizeFilter, an untrusted `{ $gt: x }` becomes `{ $eq: { $gt: x } }`, which matches nothing, and
 * in-memory fakes cannot show that. Tests use this to prove our own operators survive.
 */
export function sanitizedFilter(
  model: Model<never>,
  filter: Record<string, unknown>,
): Record<string, unknown> {
  const query = model.find(filter as never) as unknown as {
    _castConditions(): void;
    getFilter(): Record<string, unknown>;
  };
  query._castConditions();
  return query.getFilter();
}

export function hasWrappedOperator(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([k, v]) =>
      (k === "$eq" &&
        typeof v === "object" &&
        v !== null &&
        Object.keys(v as object).some((x) => x.startsWith("$"))) ||
      hasWrappedOperator(v),
  );
}
