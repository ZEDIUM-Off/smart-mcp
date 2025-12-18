import { useCallback, useEffect, useMemo, useState } from "react";

import { getTranslation, loadTranslations, Translations } from "@/lib/i18n";

import { useLocale } from "./useLocale";

export function useTranslations() {
  const locale = useLocale();
  const [translations, setTranslations] = useState<Translations | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    loadTranslations(locale)
      .then(setTranslations)
      .finally(() => setIsLoading(false));
  }, [locale]);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    if (!translations) return key;
    return getTranslation(translations, key, params);
  }, [translations]);

  return useMemo(() => ({ t, isLoading, locale }), [t, isLoading, locale]);
}
