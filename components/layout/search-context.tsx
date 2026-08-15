"use client";
import * as React from "react";

interface SearchContextValue {
  query: string;
  setQuery: (query: string) => void;
}

const SearchContext = React.createContext<SearchContextValue | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = React.useState("");
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>;
}

// Read by the Topbar's search input (writer) and by each list page (reader)
// -- POs, requisitions, suppliers, invoices all filter their own already-
// fetched data against this shared query, matching the Topbar's placeholder
// text ("Search POs, requisitions, suppliers, invoices...").
export function useGlobalSearch() {
  const ctx = React.useContext(SearchContext);
  if (!ctx) throw new Error("useGlobalSearch must be used within SearchProvider");
  return ctx;
}
