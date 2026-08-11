import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  Camera,
  Check,
  ImagePlus,
  RotateCcw,
  Smile,
  X,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_AVATAR_BG,
  type AppProfile,
  type ProfileAvatar,
} from "@/lib/app-store";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// AvatarEditor — bottom sheet used for both creating and editing a profile.
// Emoji mode: type any emoji (or pick one) and choose the background color
// from swatches or the native color picker. Photo mode: upload an image,
// preview it live, zoom with the slider and drag to reposition the crop.
// ---------------------------------------------------------------------------

const EMOJI_PICKS = [
  "🌿", "🐱", "⚡", "🌙", "🌵", "🎧",
  "📸", "🎮", "🍕", "🚀", "🦊", "🌸",
  "💼", "🏠", "🚗", "💳", "🎯", "🌈",
];

const BG_COLORS = [
  "#2F6BFF", "#5856D6", "#AF52DE", "#FF3B30",
  "#FF9500", "#FFCC00", "#34C759", "#1FBF4F",
  "#00C7BE", "#007AFF", "#8E8E93", "#5B5F6E",
];

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[15px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint";

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Reads a file, downscales it to max 512px and returns a compact JPEG data URL. */
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode-failed"));
      img.onload = () => {
        const MAX = 512;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("no-canvas"));
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function AvatarEditor({
  open,
  profile,
  onSave,
  onClose,
}: {
  open: boolean;
  profile?: AppProfile | null;
  onSave: (data: { name: string; avatar: ProfileAvatar }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"emoji" | "image">("emoji");
  const [emoji, setEmoji] = useState("🌿");
  const [bg, setBg] = useState(DEFAULT_AVATAR_BG);
  const [image, setImage] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [busy, setBusy] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Sync the form whenever the editor opens (create resets, edit pre-fills).
  useEffect(() => {
    if (!open) return;
    const av = profile?.avatar;
    setName(profile?.name ?? "");
    setTab(av?.kind === "image" && av.image ? "image" : "emoji");
    setEmoji(av?.emoji || "🌿");
    setBg(av?.bg || DEFAULT_AVATAR_BG);
    setImage(av?.kind === "image" ? av.image : null);
    setScale(av?.crop.scale ?? 1);
    setPanX(av?.crop.panX ?? 0);
    setPanY(av?.crop.panY ?? 0);
  }, [open, profile]);

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/") || busy) return;
    setBusy(true);
    try {
      const url = await fileToAvatarDataUrl(file);
      setImage(url);
      setScale(1);
      setPanX(0);
      setPanY(0);
    } catch {
      toast("Não foi possível ler essa imagem", {
        description: "Tente outra foto.",
      });
    } finally {
      setBusy(false);
    }
  };

  // ---- Drag-to-pan on the preview circle (photo mode) ----
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (tab !== "image" || !image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX, panY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const overflowX = (rect.width * (scale - 1)) / 2;
    const overflowY = (rect.height * (scale - 1)) / 2;
    setPanX(overflowX > 1 ? clamp(drag.panX + dx / overflowX, -1, 1) : 0);
    setPanY(overflowY > 1 ? clamp(drag.panY + dy / overflowY, -1, 1) : 0);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    const useImage = tab === "image" && image;
    onSave({
      name: trimmed,
      avatar: {
        kind: useImage ? "image" : "emoji",
        emoji: emoji.trim() || "👤",
        image: useImage ? image : null,
        bg,
        crop: { scale, panX, panY },
      },
    });
    onClose();
  };

  const screen = document.getElementById("app-screen");
  if (!open || !screen) return null;

  const showImage = tab === "image" && image;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
      className="absolute inset-0 z-[60] flex items-end justify-center bg-[#0b1630]/45 backdrop-blur-[2px]"
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 30, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        className="glass glass-strong max-h-[90%] w-full overflow-y-auto no-scrollbar rounded-t-[2rem] p-5 pb-7"
      >
        {/* Grab handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/10" />

        <div className="flex items-center justify-between">
          <p className="text-[17px] font-bold tracking-tight text-glass-ink">
            {profile ? "Editar perfil" : "Novo perfil"}
          </p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="glass glass-soft flex size-8 items-center justify-center rounded-full text-glass-sub transition-transform active:scale-90"
          >
            <X className="size-4" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do perfil"
          maxLength={24}
          className={cn(inputClass, "mt-4")}
        />

        {/* Live preview */}
        <div className="mt-5 flex justify-center">
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cn(
              "relative flex size-28 items-center justify-center overflow-hidden rounded-full shadow-[0_10px_30px_-10px_rgba(47,107,255,0.5)]",
              showImage &&
                "cursor-grab touch-none select-none active:cursor-grabbing",
            )}
            style={{ backgroundColor: bg }}
          >
            {showImage ? (
              <img
                src={image!}
                alt="Prévia do avatar"
                draggable={false}
                className="size-full object-cover"
                style={{
                  transform: `translate(${(
                    panX * (scale - 1) * 50
                  ).toFixed(2)}%, ${(
                    panY * (scale - 1) * 50
                  ).toFixed(2)}%) scale(${scale})`,
                }}
              />
            ) : (
              <span className="text-[44px] leading-none">
                {emoji || "👤"}
              </span>
            )}
          </div>
        </div>

        {/* Emoji / Photo tabs */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-black/5 p-1">
          {(["emoji", "image"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl py-2 text-[13.5px] font-semibold transition-all",
                tab === t
                  ? "bg-white text-glass-ink shadow-sm"
                  : "text-glass-sub",
              )}
            >
              {t === "emoji" ? (
                <Smile className="size-4" />
              ) : (
                <Camera className="size-4" />
              )}
              {t === "emoji" ? "Emoji" : "Foto"}
            </button>
          ))}
        </div>

        {tab === "emoji" ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Digite um emoji
              </p>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="Ex.: 🌿 ou 🐱"
                maxLength={4}
                className={cn(inputClass, "mt-2")}
              />
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Sugestões
              </p>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {EMOJI_PICKS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-label={`Avatar ${e}`}
                    onClick={() => setEmoji(e)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-2xl text-xl transition-all",
                      emoji === e
                        ? "bg-primary/15 ring-2 ring-primary"
                        : "glass glass-soft",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-glass-sub">
                Cor de fundo
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                {BG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Fundo ${c}`}
                    onClick={() => setBg(c)}
                    className={cn(
                      "size-7 rounded-full transition-transform active:scale-90",
                      bg.toLowerCase() === c.toLowerCase() &&
                        "ring-2 ring-glass-ink ring-offset-2 ring-offset-white/70",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <label
                  title="Cor personalizada"
                  className="relative size-7 cursor-pointer overflow-hidden rounded-full"
                  style={{
                    background:
                      "conic-gradient(#FF3B30, #FFCC00, #34C759, #00C7BE, #2F6BFF, #AF52DE, #FF3B30)",
                  }}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white drop-shadow">
                    +
                  </span>
                  <input
                    type="color"
                    value={bg}
                    onChange={(e) => setBg(e.target.value)}
                    aria-label="Seletor de cores"
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {!image ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-glass-faint/60 py-6 text-glass-sub transition-colors hover:bg-white/40"
              >
                <ImagePlus className="size-6" />
                <span className="text-[13.5px] font-semibold">
                  {busy ? "Processando…" : "Escolher foto"}
                </span>
                <span className="text-[11.5px]">
                  A imagem fica salva só no seu dispositivo
                </span>
              </button>
            ) : (
              <>
                <p className="text-center text-[12px] text-glass-sub">
                  Arraste para reposicionar · use o controle para dar zoom
                </p>
                <div className="space-y-2.5 px-1">
                  <div className="flex items-center gap-3">
                    <ZoomIn className="size-4 shrink-0 text-glass-sub" />
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.01}
                      value={scale}
                      onChange={(e) => setScale(parseFloat(e.target.value))}
                      aria-label="Zoom da foto"
                      className="w-full accent-[#2F6BFF]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setScale(1);
                      setPanX(0);
                      setPanY(0);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold text-glass-sub transition-colors hover:bg-white/40"
                  >
                    <RotateCcw className="size-3.5" />
                    Redefinir enquadramento
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="glass glass-soft flex w-full items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[13.5px] font-semibold text-glass-ink transition-colors hover:bg-white/50"
                >
                  <Camera className="size-4" />
                  Trocar foto
                </button>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={!name.trim() || busy}
          onClick={handleSave}
          className={cn(
            "mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]",
            (!name.trim() || busy) && "opacity-50",
          )}
        >
          <Check className="size-4" strokeWidth={2.6} />
          {profile ? "Salvar alterações" : "Criar perfil"}
        </button>
      </motion.div>
    </motion.div>,
    screen,
  );
}
