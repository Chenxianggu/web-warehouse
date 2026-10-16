"use client";

import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/components/theme-provider";

export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
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
      theme={resolvedTheme}
      {...props}
    />
  );
}
