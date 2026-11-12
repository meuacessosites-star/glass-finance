import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AppConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
};

/** Consistent, accessible in-app confirmation instead of the browser's native prompt. */
export function AppConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  busy = false,
}: AppConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <AlertDialogContent className="glass-strong z-[200] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-glass-ink/10 p-5 text-glass-ink shadow-2xl dark:border-white/15 dark:text-white sm:p-6">
        <AlertDialogHeader className="gap-2 text-left">
          <AlertDialogTitle className="text-lg font-bold tracking-tight">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-glass-sub dark:text-white/75">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <AlertDialogCancel
            disabled={busy}
            className="mt-0 min-h-11 rounded-xl border border-glass-ink/15 bg-transparent px-4 text-glass-ink hover:bg-glass-ink/5 dark:border-white/20 dark:text-white"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={busy}
            className={destructive
              ? "min-h-11 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700"
              : "min-h-11 rounded-xl bg-primary px-4 font-semibold text-white hover:bg-primary/90"}
          >
            {busy ? "Aguarde…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
