"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

function clearNotice() {
  const url = new URL(window.location.href);
  url.searchParams.delete("notice");
  url.searchParams.delete("role");
  url.searchParams.delete("changed");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function FloatingSuccessMessage({
  title,
  description,
  duration = 3500,
}: {
  title: string;
  description: string;
  duration?: number;
}) {
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.success(title, { description, duration });
    clearNotice();
  }, [description, duration, title]);

  return null;
}
