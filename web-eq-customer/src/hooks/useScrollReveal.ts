import { useEffect } from "react";

/**
 * Attaches an IntersectionObserver to every `.reveal` element on the page.
 * When an element enters the viewport it receives the `.visible` class which
 * triggers the CSS fade-up animation defined in index.scss.
 *
 * Pass `deps` to re-run the observer after async data loads (e.g. after a
 * category list or business list finishes loading).
 */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    // Small delay so React has committed the new DOM nodes
    const timer = setTimeout(() => {
      const reveals = document.querySelectorAll<HTMLElement>(".reveal");

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12 }
      );

      reveals.forEach((el) => observer?.observe(el));
    }, 50);

    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
