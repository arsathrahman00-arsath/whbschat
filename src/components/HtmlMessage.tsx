// Safely renders HTML content coming from backend chat messages.
// - Sanitizes via DOMPurify
// - Delegates clicks on elements with [data-action="approve"|"reject"]
//   to onAction handler (currently logs to console).
// - Scoped styling so embedded tables/buttons don't break chat layout.

import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";

interface Props {
  html: string;
  isMe: boolean;
  onAction?: (action: string, el: HTMLElement) => void;
}

/** Quick heuristic: does this string look like HTML? */
export function looksLikeHtml(s: string | null | undefined): boolean {
  if (!s) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

export default function HtmlMessage({ html, isMe, onAction }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_ATTR: ["data-action", "target", "rel"],
      }),
    [html],
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const actionEl = target.closest<HTMLElement>("[data-action]");
      if (!actionEl) return;
      e.preventDefault();
      e.stopPropagation();
      // Ignore if any action button in this message is already disabled.
      const allActionEls = node.querySelectorAll<HTMLElement>("[data-action]");
      const alreadyUsed = Array.from(allActionEls).some(
        (el) =>
          el.getAttribute("aria-disabled") === "true" ||
          (el as HTMLButtonElement).disabled,
      );
      if (alreadyUsed) return;

      const action = actionEl.getAttribute("data-action") || "";
      if (action === "approve") console.log("Approved clicked");
      else if (action === "reject") console.log("Rejected clicked");

      // Disable both Approve and Reject after one is clicked.
      allActionEls.forEach((el) => {
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("data-used", "true");
        if ("disabled" in el) (el as HTMLButtonElement).disabled = true;
        el.style.opacity = "0.5";
        el.style.cursor = "not-allowed";
        el.style.pointerEvents = "none";
      });

      // Broadcast so page-level handlers (e.g. ChannelPage) can react
      // without prop-drilling through every message component.
      window.dispatchEvent(
        new CustomEvent("html-message-action", {
          detail: { action, element: actionEl },
        }),
      );
      onAction?.(action, actionEl);
    };
    node.addEventListener("click", handler);
    return () => node.removeEventListener("click", handler);
  }, [clean, onAction]);

  return (
    <div
      ref={containerRef}
      className={`html-message break-words ${isMe ? "html-message--me" : "html-message--them"}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
