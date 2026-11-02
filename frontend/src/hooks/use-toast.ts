"use client";

/**
 * Minimal toast hook.
 *
 * The admin panel calls `toast({ title, description, variant })`; there is no
 * global toast host in this app yet, so this is a no-op sink that keeps the
 * call sites typed. Swap for a real toast implementation when one lands.
 */
export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

export function useToast() {
  const toast = (_options: ToastOptions): void => {
    // no-op until a toast host exists
  };
  return { toast };
}
