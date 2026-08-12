import type { LucideIcon } from "lucide-react";
import {
  PencilLine,
  Camera,
  Mic,
  Handshake,
  ChevronRight,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { toast } from "sonner";
import { SquircleIcon } from "./ThemeToggle";

const options: {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  color: string;
}[] = [
  {
    id: "manual",
    label: "Adicionar Manual",
    desc: "Registre um gasto ou ganho",
    icon: PencilLine,
    color: "#2F6BFF",
  },
  {
    id: "scan",
    label: "Escanear Nota",
    desc: "Fotografe o cupom e registre na hora",
    icon: Camera,
    color: "#1FBF4F",
  },
  {
    id: "voice",
    label: "Comando de Voz",
    desc: "Dite o gasto e pronto",
    icon: Mic,
    color: "#AF52DE",
  },
  {
    id: "loan",
    label: "Emprestar/Cartão",
    desc: "Dinheiro e cartão de terceiros",
    icon: Handshake,
    color: "#FF9500",
  },
];

export function AddMenu({
  open,
  onClose,
  onManual,
}: {
  open: boolean;
  onClose: () => void;
  /** Called when “Adicionar Manual” is chosen — opens the add screen. */
  onManual?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handlePick = (option: (typeof options)[number]) => {
    onClose();
    if (option.id === "manual") {
      onManual?.();
      return;
    }
    toast(`${option.label} chega em breve`, {
      description: "Estamos finalizando este recurso para você ✨",
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-[#0b1630]/45 backdrop-blur-[2px]"
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 330 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 500) onClose();
            }}
            className="glass glass-strong absolute inset-x-0 bottom-0 z-50 rounded-t-[2.2rem] px-5 pb-8 pt-3"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-black/15 dark:bg-black/25" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-glass-ink">
                  Adicionar
                </h3>
                <p className="text-[13px] text-glass-sub">
                  Como você quer registrar?
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={onClose}
                className="glass glass-soft flex size-8 items-center justify-center rounded-full text-glass-sub active:scale-90"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-1">
              {options.map((option, index) => (
                <motion.button
                  key={option.id}
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 + index * 0.045 }}
                  onClick={() => handlePick(option)}
                  className="glass glass-soft flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-transform active:scale-[0.98]"
                >
                  <SquircleIcon
                    icon={option.icon}
                    color={option.color}
                    size="size-12"
                    iconSize="size-[21px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-glass-ink">
                      {option.label}
                    </p>
                    <p className="truncate text-[12.5px] text-glass-sub">
                      {option.desc}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-glass-faint" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
