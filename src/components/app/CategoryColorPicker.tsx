import { useId, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import { Check, Palette, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Tone = { h: number; s: number; v: number };

function hexToTone(hex: string): Tone {
  const valid = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#2F6BFF";
  const [r, g, b] = [1, 3, 5].map(
    (start) => parseInt(valid.slice(start, start + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return {
    h: (h * 60 + 360) % 360,
    s: max ? (delta / max) * 100 : 0,
    v: max * 100,
  };
}

function toneToHex({ h, s, v }: Tone): string {
  const brightness = v / 100;
  const saturation = s / 100;
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(
      255 *
        (brightness -
          brightness * saturation * Math.max(0, Math.min(k, 4 - k, 1))),
    )
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`.toUpperCase();
}

export function CategoryColorPicker({
  value,
  palette,
  onChange,
}: {
  value: string;
  palette: string[];
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => hexToTone(value));
  const id = useId();
  const chosen = toneToHex(draft);
  const controls = [
    {
      key: "h",
      label: "Tom da cor",
      max: 360,
      background:
        "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
    },
    {
      key: "s",
      label: "Intensidade",
      max: 100,
      background: `linear-gradient(to right, ${toneToHex({ ...draft, s: 0 })}, ${toneToHex({ ...draft, s: 100 })})`,
    },
    {
      key: "v",
      label: "Luminosidade",
      max: 100,
      background: `linear-gradient(to right, #000, ${toneToHex({ ...draft, v: 100 })})`,
    },
  ] as const;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(hexToTone(value));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="glass glass-soft flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2 text-[13px] font-semibold text-glass-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span
            aria-hidden="true"
            className="size-7 rounded-lg border border-black/10"
            style={{ backgroundColor: value }}
          />
          <Palette className="size-4 text-primary" />
          Personalizar cor
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="glass-strong flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 text-glass-ink"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-glass-ink/10 px-5 py-4">
          <DialogHeader className="min-w-0 text-left">
            <DialogTitle>Escolher cor</DialogTitle>
            <DialogDescription>
              Ajuste o tom até ficar como você quer.
            </DialogDescription>
          </DialogHeader>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Fechar seletor de cor"
              className="glass flex size-10 shrink-0 items-center justify-center rounded-full text-glass-sub"
            >
              <X className="size-[18px]" />
            </button>
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Cor atual", color: value },
              { label: "Nova cor", color: chosen },
            ].map((preview) => (
              <div key={preview.label} className="min-w-0">
                <p className="mb-1.5 text-[12px] font-semibold text-glass-sub">
                  {preview.label}
                </p>
                <div
                  className="h-14 rounded-2xl border border-glass-ink/15"
                  style={{ backgroundColor: preview.color }}
                  aria-label={`${preview.label}: ${preview.color}`}
                />
                <p className="mt-1.5 text-[12px] font-semibold text-glass-sub">
                  {preview.color.toUpperCase()}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {controls.map((control) => (
              <div key={control.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
                  <span id={`${id}-${control.key}`} className="font-semibold">
                    {control.label}
                  </span>
                  <span className="text-glass-sub">
                    {Math.round(draft[control.key])}
                    {control.key === "h" ? "°" : "%"}
                  </span>
                </div>
                <Slider.Root
                  value={[draft[control.key]]}
                  min={0}
                  max={control.max}
                  step={1}
                  onValueChange={([next]) =>
                    setDraft((previous) => ({
                      ...previous,
                      [control.key]: next,
                    }))
                  }
                  className="relative flex h-10 w-full touch-none select-none items-center"
                >
                  <Slider.Track
                    className="relative h-4 grow rounded-full border border-black/10"
                    style={{ background: control.background }}
                  />
                  <Slider.Thumb
                    aria-labelledby={`${id}-${control.key}`}
                    className="block size-7 rounded-full border-[3px] border-white bg-glass-ink shadow-[0_1px_6px_rgba(0,0,0,0.35)] ring-1 ring-black/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
                  />
                </Slider.Root>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-glass-sub">
              Cores prontas
            </p>
            <div className="grid grid-cols-6 gap-2">
              {palette.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Escolher cor ${color}`}
                  aria-pressed={chosen === color.toUpperCase()}
                  onClick={() => setDraft(hexToTone(color))}
                  className={cn(
                    "flex aspect-square w-full max-w-11 items-center justify-center rounded-full border border-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    chosen === color.toUpperCase() &&
                      "ring-2 ring-glass-ink ring-offset-2 ring-offset-background",
                  )}
                  style={{ backgroundColor: color }}
                >
                  {chosen === color.toUpperCase() && (
                    <Check className="size-4 text-white drop-shadow-[0_1px_2px_black]" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-glass-ink/10 px-5 py-4">
          <DialogClose asChild>
            <button
              type="button"
              className="glass min-h-11 flex-1 rounded-2xl px-3 py-2 text-[13px] font-semibold"
            >
              Cancelar
            </button>
          </DialogClose>
          <button
            type="button"
            onClick={() => {
              onChange(chosen);
              setOpen(false);
            }}
            className="min-h-11 flex-1 rounded-2xl bg-primary px-3 py-2 text-[13px] font-semibold text-white"
          >
            Usar esta cor
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
