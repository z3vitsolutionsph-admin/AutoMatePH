"use client"

import React from 'react';
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-[#1D9E75]" />
        ),
        info: (
          <InfoIcon className="size-4 text-[#FF6F00]" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-amber-400" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-red-400" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin text-[#FF6F00]" />
        ),
      }}
      toastOptions={{
        classNames: {
          toast: "!bg-[#141210] !border-[#3A3230] !text-[#FAF7F2] font-mono text-xs !shadow-xl !rounded-lg",
          description: "!text-[#7A736E] font-mono text-[11px]",
          actionButton: "!bg-[#FF6F00] !text-[#0A0C10] font-mono font-bold text-xs hover:!bg-[#FF851B]",
          cancelButton: "!bg-[#1A1614] !text-[#FAF7F2] !border-[#3A3230] font-mono text-xs hover:!bg-[#25201D]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
