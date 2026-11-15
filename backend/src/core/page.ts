/** Shared paging shape for every admin list. Page numbers start at 1; page size is capped by the caller. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export const MAX_PAGE_SIZE = 100;

/** Escapes user text for use inside a regular expression (search boxes). */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function paginate<T>(rows: T[], { page, pageSize }: PageRequest): Page<T> {
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
  };
}
