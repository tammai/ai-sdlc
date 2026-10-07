import { useEffect } from "react";

/** Sets the document title for the current page (announced by screen readers on navigation). */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - __APP_TITLE__`;
  }, [title]);
}
