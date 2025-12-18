"use client";

import * as React from "react";

export type PageHeaderState = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
};

type PageHeaderContextValue = {
  header: PageHeaderState;
  setHeader: (next: PageHeaderState) => void;
  clearHeader: () => void;
};

const PageHeaderContext = React.createContext<PageHeaderContextValue | null>(
  null,
);

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeaderState] = React.useState<PageHeaderState>({});

  const setHeader = React.useCallback((next: PageHeaderState) => {
    setHeaderState(next);
  }, []);

  const clearHeader = React.useCallback(() => {
    setHeaderState({});
  }, []);

  const value = React.useMemo<PageHeaderContextValue>(
    () => ({ header, setHeader, clearHeader }),
    [header, setHeader, clearHeader],
  );

  return (
    <PageHeaderContext.Provider value={value}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader() {
  const ctx = React.useContext(PageHeaderContext);
  if (!ctx) {
    throw new Error("usePageHeader must be used within a PageHeaderProvider.");
  }
  return ctx;
}


