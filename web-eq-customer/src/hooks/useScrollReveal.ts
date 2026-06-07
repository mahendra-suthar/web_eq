import { useEffect } from "react";

/**
 * Auto-reveal hook.
 *
 * Adds `.visible` to every `.reveal` element as soon as it scrolls into view —
 * including elements added to the DOM *after* the hook mounts (async content).
 * A single MutationObserver rooted at `<body>` picks up new `.reveal` nodes
 * automatically, so individual pages no longer need to maintain a `deps` array
 * for every async section.
 *
 * The optional `deps` parameter is accepted for backwards compatibility but is
 * ignored by this implementation — new call sites can omit it entirely.
 */
export function useScrollReveal(_deps: unknown[] = []): void {
  useEffect(() => {
    if (typeof document === "undefined") return; // SSR / non-browser guard

    // Prevents double-observing the same element across mutations / re-renders.
    const tracked = new WeakSet<Element>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );

    const observe = (el: Element): void => {
      if (tracked.has(el) || el.classList.contains("visible")) return;
      tracked.add(el);
      io.observe(el);
    };

    // 1) Catch every `.reveal` already in the document.
    document.querySelectorAll<HTMLElement>(".reveal").forEach(observe);

    // 2) Watch for future `.reveal` nodes added anywhere under `<body>`.
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== "childList") continue;
        m.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.classList.contains("reveal")) observe(node);
          node.querySelectorAll<HTMLElement>(".reveal").forEach(observe);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
