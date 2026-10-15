import type { Page } from "./types.js";

export interface PaginationOptions<T> {
  readonly fetchPage: (cursor: string | null) => Promise<Page<T>>;
  readonly identify: (item: T) => string;
  readonly maxPages?: number;
}

export async function collectAllPages<T>({
  fetchPage,
  identify,
  maxPages = 10_000,
}: PaginationOptions<T>): Promise<T[]> {
  const items = new Map<string, T>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await fetchPage(cursor);

    for (const item of page.items) {
      items.set(identify(item), item);
    }

    if (page.nextCursor === null) {
      return [...items.values()];
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`QQMusic pagination repeated cursor: ${page.nextCursor}`);
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error(`QQMusic pagination exceeded ${maxPages} pages`);
}

