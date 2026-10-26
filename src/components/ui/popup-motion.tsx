"use client";

import { createContext, useState } from "react";

export const PopupOpenContext = createContext(true);

export function usePopupState({ open, defaultOpen = false, onOpenChange }: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  return {
    open: open ?? uncontrolledOpen,
    onOpenChange(next: boolean) {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
  };
}

// Keep the last open render while Radix Presence plays the CSS exit animation.
// Callers can clear their form/selection immediately without collapsing the popup.
export function useExitSnapshot<T>(props: T, open: boolean): T {
  const [snapshot, setSnapshot] = useState({ props });
  if (open && snapshot.props !== props) setSnapshot({ props });
  return open ? props : snapshot.props;
}
