"use client";

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="rz-sonner"
      closeButton
      duration={3600}
      icons={{
        success: <CircleCheck aria-hidden="true" />,
        error: <CircleAlert aria-hidden="true" />,
        warning: <TriangleAlert aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        loading: <LoaderCircle aria-hidden="true" />,
      }}
      position="top-center"
      richColors
      theme="dark"
      {...props}
    />
  );
}
