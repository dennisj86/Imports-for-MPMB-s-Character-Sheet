const OPEN5E_API_BASE_URL = "https://api.open5e.com/v2";
const DEFAULT_PAGE_LIMIT = 50;

type FetchJsonOptions = {
  retries?: number;
  retryDelayMs?: number;
};

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 400;
  let attempt = 0;
  while (true) {
    attempt += 1;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (response.ok) {
      return (await response.json()) as T;
    }
    if (attempt <= retries && shouldRetry(response.status)) {
      await sleep(retryDelayMs * attempt);
      continue;
    }
    const body = await response.text();
    throw new Error(`Open5e request failed (${response.status}) ${url}\n${body.slice(0, 300)}`);
  }
}

function buildUrl(endpoint: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${OPEN5E_API_BASE_URL}/${endpoint.replace(/^\/+/, "").replace(/\/+$/, "")}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function normalizeNextUrl(next: string | null): string | null {
  if (!next) {
    return null;
  }
  return next.startsWith("http") ? next : `${OPEN5E_API_BASE_URL}${next}`;
}

export type FetchAllPagesOptions = {
  limit?: number;
  pauseMs?: number;
  retries?: number;
};

export class Open5eClient {
  async fetchAllPages<T>(
    endpoint: string,
    params: Record<string, string | number | undefined> = {},
    options: FetchAllPagesOptions = {},
  ): Promise<{ entries: T[]; count: number }> {
    const limit = options.limit ?? DEFAULT_PAGE_LIMIT;
    const pauseMs = options.pauseMs ?? 120;
    const retries = options.retries ?? 3;
    const allEntries: T[] = [];

    let url: string | null = buildUrl(endpoint, {
      ...params,
      limit,
      page: 1,
    });
    let total = 0;
    while (url) {
      const page = await fetchJson<PaginatedResponse<T>>(url, { retries });
      total = page.count;
      allEntries.push(...page.results);
      url = normalizeNextUrl(page.next);
      if (url && pauseMs > 0) {
        await sleep(pauseMs);
      }
    }
    return {
      entries: allEntries,
      count: total,
    };
  }
}

export function getOpen5eApiBaseUrl(): string {
  return OPEN5E_API_BASE_URL;
}
