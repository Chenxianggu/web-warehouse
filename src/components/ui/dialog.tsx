"use client";

import { useContext, type ComponentProps } from "react";
import { Dialog as DialogPrimitive, AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { PopupOpenContext, useExitSnapshot, usePopupState } from "./popup-motion";

function DialogRoot(props: ComponentProps<typeof DialogPrimitive.Root>) {
  const state = usePopupState(props);
  return <PopupOpenContext value={state.open}><DialogPrimitive.Root {...props} {...state} /></PopupOpenContext>;
}

function AlertDialogRoot(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const state = usePopupState(props);
  return <PopupOpenContext value={state.open}><AlertDialogPrimitive.Root {...props} {...state} /></PopupOpenContext>;
}

function DialogContent({ children, onCloseAutoFocus, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  const open = useContext(PopupOpenContext);
  const content = useExitSnapshot(children, open);
  const restoreFocus = useExitSnapshot(onCloseAutoFocus, open);
  return <DialogPrimitive.Content {...props} data-rz-motion="dialog" inert={!open || props.inert} onCloseAutoFocus={restoreFocus}>{content}</DialogPrimitive.Content>;
}

function AlertDialogContent({ children, onCloseAutoFocus, ...props }: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  const open = useContext(PopupOpenContext);
  const content = useExitSnapshot(children, open);
  const restoreFocus = useExitSnapshot(onCloseAutoFocus, open);
  return <AlertDialogPrimitive.Content {...props} data-rz-motion="dialog" inert={!open || props.inert} onCloseAutoFocus={restoreFocus}>{content}</AlertDialogPrimitive.Content>;
}

function DialogOverlay(props: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay {...props} data-rz-motion="overlay" />;
}

function AlertDialogOverlay(props: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return <AlertDialogPrimitive.Overlay {...props} data-rz-motion="overlay" />;
}

export const Dialog = { ...DialogPrimitive, Root: DialogRoot, Content: DialogContent, Overlay: DialogOverlay };
export const AlertDialog = { ...AlertDialogPrimitive, Root: AlertDialogRoot, Content: AlertDialogContent, Overlay: AlertDialogOverlay };
