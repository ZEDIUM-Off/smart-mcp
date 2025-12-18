"use client";

import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { SearchSkeleton } from "@/components/skeletons/search-skeleton";
import { usePageHeader } from "@/components/page-header-context";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/hooks/useTranslations";
import type { PaginatedSearchResult } from "@/types/search";

import CardGrid from "./components/CardGrid";
import { PaginationUi } from "./components/PaginationUi";

const PAGE_SIZE = 6;

function SearchContent() {
  const { t } = useTranslations();
  const searchParams = useSearchParams();
  const { setHeader, clearHeader } = usePageHeader();

  // Initialize search query from URL on mount (for direct links)
  const initialQuery = searchParams.get("query") || "";
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [currentPage, setCurrentPage] = useState(1);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Note: We don't update the URL during typing to avoid page refreshes
  // The search functionality works entirely with local state

  // Calculate offset based on current page
  const offset = (currentPage - 1) * PAGE_SIZE;

  const { data, error, isLoading } = useQuery<PaginatedSearchResult>({
    queryKey: ["search", debouncedQuery, offset],
    queryFn: async () => {
      const res = await fetch(
        `/service/search?query=${encodeURIComponent(debouncedQuery)}&pageSize=${PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(
          `Failed to fetch: ${res.status} ${res.statusText} - ${errorText}`,
        );
      }
      return res.json();
    },
    // Always enabled - show all results when no query, filtered results when there's a query
  });

  if (error) console.error("Search error:", error);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Memoize pagination info to prevent unnecessary re-renders
  const paginationInfo = useMemo(() => {
    if (!data) return null;
    return {
      currentPage,
      totalPages: Math.ceil(data.total / PAGE_SIZE),
    };
  }, [data, currentPage]);

  useEffect(() => {
    setHeader({
      title: t("search:title"),
      description: t("search:searchPlaceholder"),
      icon: <SearchIcon className="h-5 w-5" />,
    });
    return () => clearHeader();
  }, [clearHeader, setHeader, t]);

  return (
    <div className="space-y-6 flex flex-col items-center">
      <Input
        type="search"
        placeholder={t("search:searchPlaceholder")}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-xl mx-auto"
      />

      {error && (
        <div>
          {t("search:error")}:{" "}
          {error.message +
            " | You may need a proxy server to access Cloudflare."}
        </div>
      )}

      {/* Results area - show skeleton only here, not the entire component */}
      {isLoading ? (
        <SearchSkeleton />
      ) : (
        <>
          {data?.results && Object.keys(data.results).length > 0 && (
            <CardGrid items={data.results} />
          )}

          {data?.results && Object.keys(data.results).length === 0 && (
            <div className="text-center text-muted-foreground">
              {t("search:noResults")}
            </div>
          )}

          {paginationInfo && paginationInfo.totalPages > 1 && (
            <PaginationUi
              currentPage={paginationInfo.currentPage}
              totalPages={paginationInfo.totalPages}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchSkeleton />}>
      <SearchContent />
    </Suspense>
  );
}
