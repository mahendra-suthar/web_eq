import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DEBOUNCE_DELAY_MS } from "../utils/constants";

export interface AdminListResult<T> {
  items: T[];
  total: number;
  pages: number;
}

export interface UseAdminListOptions<T> {
  fetchFn: (
    page: number,
    search: string,
    filters: Record<string, any>
  ) => Promise<AdminListResult<T>>;
  debounceMs?: number;
}

export interface UseAdminListReturn<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  search: string;
  filters: Record<string, any>;
  loading: boolean;
  error: string;
  success: string;
  setSearch: (s: string) => void;
  setPage: (p: number | ((prev: number) => number)) => void;
  setFilters: (f: Record<string, any>) => void;
  refresh: () => void;
  setSuccess: (s: string) => void;
  setError: (s: string) => void;
}

/**
 * Generic hook for paginated admin list pages.
 * Handles debounced search, pagination, filters, loading, error, and success state.
 */
export function useAdminList<T>({
  fetchFn,
  debounceMs = DEFAULT_DEBOUNCE_DELAY_MS,
}: UseAdminListOptions<T>): UseAdminListReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearchState] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFiltersState] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setErrorState] = useState("");
  const [success, setSuccessState] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPageState(1);
    }, debounceMs);
    return () => clearTimeout(debounceRef.current);
  }, [search, debounceMs]);

  const doFetch = useCallback(
    async (p: number, s: string, f: Record<string, any>) => {
      setLoading(true);
      setErrorState("");
      try {
        const res = await fetchFn(p, s, f);
        setItems(res.items);
        setTotal(res.total);
        setPages(res.pages);
      } catch {
        setErrorState("Failed to load data.");
      } finally {
        setLoading(false);
      }
    },
    [fetchFn]
  );

  useEffect(() => {
    doFetch(page, debouncedSearch, filters);
  }, [page, debouncedSearch, filters, doFetch]);

  const setSearch = useCallback((s: string) => setSearchState(s), []);

  const setPage = useCallback(
    (p: number | ((prev: number) => number)) => setPageState(p),
    []
  );

  const setFilters = useCallback((f: Record<string, any>) => {
    setFiltersState(f);
    setPageState(1);
  }, []);

  const refresh = useCallback(() => {
    doFetch(page, debouncedSearch, filters);
  }, [doFetch, page, debouncedSearch, filters]);

  const setSuccess = useCallback((s: string) => {
    setSuccessState(s);
    if (s) {
      clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccessState(""), 3000);
    }
  }, []);

  const setError = useCallback((s: string) => setErrorState(s), []);

  return {
    items,
    total,
    page,
    pages,
    search,
    filters,
    loading,
    error,
    success,
    setSearch,
    setPage,
    setFilters,
    refresh,
    setSuccess,
    setError,
  };
}
