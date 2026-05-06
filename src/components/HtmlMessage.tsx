// Safely renders HTML content coming from backend chat messages.
// - Sanitizes via DOMPurify
// - Delegates clicks on elements with [data-action="approve"|"reject"]
//   to onAction handler.
// - When `actioned` is true (or a prior click was persisted for `messageId`),
//   approve/reject buttons render permanently disabled.
// - Persists the disabled state in localStorage so it survives reloads.

import { useEffect, useMemo, useRef } from "react";
import DOMPurify from "dompurify";
import {
  getMessageAction,
  isMessageActioned,
  setMessageAction,
} from "@/lib/htmlActionState";

interface Props {
  html: string;
  isMe: boolean;
  /** Stable id of the chat message — used to persist action state. */
  messageId?: string | number;
  /** Authoritative backend status; if "approved"/"rejected" buttons stay disabled. */
  status?: string | null;
  onAction?: (action: string, el: HTMLElement) => void;
}

/** Quick heuristic: does this string look like HTML? */
export function looksLikeHtml(s: string | null | undefined): boolean {
  if (!s) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

function disableActionButtons(node: HTMLElement) {
  const els = node.querySelectorAll<HTMLElement>("[data-action]");
  els.forEach((el) => {
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("data-used", "true");
    if ("disabled" in el) (el as HTMLButtonElement).disabled = true;
    el.style.opacity = "0.5";
    el.style.cursor = "not-allowed";
    el.style.pointerEvents = "none";
  });
}

export default function HtmlMessage({
  html,
  isMe,
  messageId,
  status,
  onAction,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_ATTR: ["data-action", "target", "rel"],
      }),
    [html],
  );

  // After (re)render, if this message is already actioned (from backend status
  // or from a persisted local click), disable the buttons immediately.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (isMessageActioned(messageId, status)) {
      disableActionButtons(node);
    }
  }, [clean, messageId, status]);

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

      // Block duplicate clicks: either an in-DOM disabled state OR a persisted
      // action for this message.
      const allActionEls = node.querySelectorAll<HTMLElement>("[data-action]");
      const alreadyUsedDom = Array.from(allActionEls).some(
        (el) =>
          el.getAttribute("aria-disabled") === "true" ||
          (el as HTMLButtonElement).disabled,
      );
      if (alreadyUsedDom) return;
      if (messageId != null && getMessageAction(messageId) != null) {
        disableActionButtons(node);
        return;
      }

      const action = actionEl.getAttribute("data-action") || "";
      const code = actionEl.getAttribute("data-code") || undefined;

      // Persist + disable immediately (optimistic).
      if (messageId != null) setMessageAction(messageId, action);
      disableActionButtons(node);

      window.dispatchEvent(
        new CustomEvent("html-message-action", {
          detail: { action, element: actionEl, messageId, code },
        }),
      );
      onAction?.(action, actionEl);
    };
    node.addEventListener("click", handler);
    return () => node.removeEventListener("click", handler);
  }, [clean, onAction, messageId]);

  return (
    <div
      ref={containerRef}
      className={`html-message break-words ${isMe ? "html-message--me" : "html-message--them"}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
