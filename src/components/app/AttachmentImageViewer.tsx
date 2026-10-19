import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { downloadAttachment } from "@/lib/attachment-utils";

const LIGHTBOX_MIN_ZOOM = 1;
const LIGHTBOX_MAX_ZOOM = 3;

type LightboxImageSize = {
  width: number;
  height: number;
};

function fitLightboxImageSize(
  naturalWidth: number,
  naturalHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): LightboxImageSize {
  const maxWidth = Math.max(1, viewportWidth - 80);
  const maxHeight = Math.max(1, viewportHeight - 20);
  const scale = Math.min(
    1,
    maxWidth / Math.max(1, naturalWidth),
    maxHeight / Math.max(1, naturalHeight),
  );

  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function clampLightboxZoom(value: number) {
  return Math.min(
    LIGHTBOX_MAX_ZOOM,
    Math.max(LIGHTBOX_MIN_ZOOM, Math.round(value * 100) / 100),
  );
}

function distanceBetweenPoints(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

/** Nested Radix modal keeps the owning details window open and restores focus on close. */
export function AttachmentImageViewer({
  attachments,
  initialAttachmentIndex,
  onClose,
}: {
  attachments: string[];
  initialAttachmentIndex: number;
  onClose: () => void;
}) {
  const imageAttachments = attachments.flatMap((src, index) =>
    src.startsWith("data:image") ? [{ src, index }] : [],
  );
  const [lightboxIndex, setLightboxIndex] = useState(() =>
    Math.max(
      0,
      imageAttachments.findIndex(
        (item) => item.index === initialAttachmentIndex,
      ),
    ),
  );
  const [lightboxZoom, setLightboxZoom] = useState(LIGHTBOX_MIN_ZOOM);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [lightboxImageSize, setLightboxImageSize] =
    useState<LightboxImageSize | null>(null);
  const [downloading, setDownloading] = useState(false);
  const lightboxImageRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const currentImage =
    imageAttachments[Math.min(lightboxIndex, imageAttachments.length - 1)];
  const lightboxSrc = currentImage?.src;
  const resetLightboxViewport = () => {
    activePointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
    setLightboxZoom(LIGHTBOX_MIN_ZOOM);
    setLightboxPan({ x: 0, y: 0 });
  };

  const moveLightbox = (direction: -1 | 1) => {
    if (
      lightboxIndex === null ||
      imageAttachments.length < 2 ||
      lightboxZoom > LIGHTBOX_MIN_ZOOM
    )
      return;
    setLightboxIndex((currentIndex) => {
      if (currentIndex === null) return currentIndex;
      return (
        (currentIndex + direction + imageAttachments.length) %
        imageAttachments.length
      );
    });
    setLightboxImageSize(null);
    resetLightboxViewport();
  };

  const adjustLightboxZoom = (delta: number) => {
    const nextZoom = clampLightboxZoom(lightboxZoom + delta);
    setLightboxZoom(nextZoom);
    if (nextZoom === LIGHTBOX_MIN_ZOOM) {
      setLightboxPan({ x: 0, y: 0 });
      return;
    }
    const bounds = getLightboxPanBounds(nextZoom);
    setLightboxPan((currentPan) => ({
      x: Math.min(bounds.x, Math.max(-bounds.x, currentPan.x)),
      y: Math.min(bounds.y, Math.max(-bounds.y, currentPan.y)),
    }));
  };

  const handleLightboxWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    adjustLightboxZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const getLightboxPanBounds = (zoom: number) => {
    const image = lightboxImageRef.current;
    const baseWidth = image?.offsetWidth ?? window.innerWidth - 48;
    const baseHeight = image?.offsetHeight ?? window.innerHeight - 48;
    const viewportWidth = Math.max(
      1,
      viewportRef.current?.clientWidth ?? window.innerWidth,
    );
    const viewportHeight = Math.max(
      1,
      viewportRef.current?.clientHeight ?? window.innerHeight,
    );

    return {
      x: Math.max(0, (baseWidth * zoom - viewportWidth) / 2),
      y: Math.max(0, (baseHeight * zoom - viewportHeight) / 2),
    };
  };

  const handleLightboxPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (lightboxZoom <= LIGHTBOX_MIN_ZOOM) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      const points = Array.from(activePointersRef.current.values()).slice(0, 2);
      pinchRef.current = {
        distance: distanceBetweenPoints(points[0], points[1]),
        zoom: lightboxZoom,
      };
      panRef.current = null;
      return;
    }

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: lightboxPan.x,
      originY: lightboxPan.y,
    };
  };

  const handleLightboxPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointersRef.current.size >= 2) {
      event.preventDefault();
      event.stopPropagation();
      const points = Array.from(activePointersRef.current.values()).slice(0, 2);
      const distance = distanceBetweenPoints(points[0], points[1]);
      const pinch = pinchRef.current ?? { distance, zoom: lightboxZoom };
      pinchRef.current = pinch;
      const nextZoom = clampLightboxZoom(
        pinch.zoom * (distance / pinch.distance),
      );
      setLightboxZoom(nextZoom);
      if (nextZoom === LIGHTBOX_MIN_ZOOM) {
        setLightboxPan({ x: 0, y: 0 });
        return;
      }
      const bounds = getLightboxPanBounds(nextZoom);
      setLightboxPan((currentPan) => ({
        x: Math.min(bounds.x, Math.max(-bounds.x, currentPan.x)),
        y: Math.min(bounds.y, Math.max(-bounds.y, currentPan.y)),
      }));
      return;
    }

    if (
      lightboxZoom <= LIGHTBOX_MIN_ZOOM ||
      !panRef.current ||
      panRef.current.pointerId !== event.pointerId
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const bounds = getLightboxPanBounds(lightboxZoom);
    setLightboxPan({
      x: Math.min(
        bounds.x,
        Math.max(
          bounds.x * -1,
          panRef.current.originX + event.clientX - panRef.current.startX,
        ),
      ),
      y: Math.min(
        bounds.y,
        Math.max(
          bounds.y * -1,
          panRef.current.originY + event.clientY - panRef.current.startY,
        ),
      ),
    });
  };

  const handleLightboxPointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    activePointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (activePointersRef.current.size < 2) pinchRef.current = null;
    if (
      activePointersRef.current.size === 1 &&
      lightboxZoom > LIGHTBOX_MIN_ZOOM
    ) {
      const [pointerId, point] = Array.from(
        activePointersRef.current.entries(),
      )[0];
      panRef.current = {
        pointerId,
        startX: point.x,
        startY: point.y,
        originX: lightboxPan.x,
        originY: lightboxPan.y,
      };
    } else if (activePointersRef.current.size === 0) {
      panRef.current = null;
    }
  };

  const handleLightboxImageLoad = (image: HTMLImageElement) => {
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
    setLightboxImageSize(
      fitLightboxImageSize(
        image.naturalWidth,
        image.naturalHeight,
        viewportRef.current?.clientWidth ?? window.innerWidth,
        viewportRef.current?.clientHeight ?? window.innerHeight,
      ),
    );
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const image = lightboxImageRef.current;
      if (image?.naturalWidth) handleLightboxImageLoad(image);
      resetLightboxViewport();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const downloadCurrentImage = async () => {
    if (!currentImage || downloading) return;
    setDownloading(true);
    try {
      await downloadAttachment(
        currentImage.src,
        `anexo-${currentImage.index + 1}`,
      );
    } catch {
      toast.error("Não foi possível baixar esta imagem");
    } finally {
      setDownloading(false);
    }
  };

  if (!lightboxSrc) return null;
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-[#0b1630]/95" />
        <DialogPrimitive.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocusRef.current?.isConnected)
              returnFocusRef.current.focus();
          }}
          className="fixed inset-0 z-[110] flex h-dvh w-screen flex-col overflow-hidden text-white outline-none"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
            <div>
              <DialogPrimitive.Title className="text-[13px] font-semibold">
                Anexo {currentImage.index + 1}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">
                Imagem ampliada. Use os controles para aumentar, reduzir,
                redefinir o zoom ou baixar a imagem.
              </DialogPrimitive.Description>
              {imageAttachments.length > 1 && (
                <p className="mt-0.5 text-[11px] text-white/70">
                  Imagem {lightboxIndex + 1} de {imageAttachments.length}
                </p>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar imagem"
                className="glass flex size-11 shrink-0 items-center justify-center rounded-full text-white"
              >
                <X className="size-[18px]" />
              </button>
            </DialogPrimitive.Close>
          </header>
          <div
            ref={viewportRef}
            className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
            onClick={(event) => {
              if (event.target === event.currentTarget) onClose();
            }}
          >
            {imageAttachments.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Imagem anterior"
                  disabled={lightboxZoom > 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveLightbox(-1);
                  }}
                  className="glass absolute left-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-white disabled:opacity-35"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima imagem"
                  disabled={lightboxZoom > 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    moveLightbox(1);
                  }}
                  className="glass absolute right-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-white disabled:opacity-35"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
            <motion.div
              drag={
                imageAttachments.length > 1 && lightboxZoom === 1 ? "x" : false
              }
              dragConstraints={{ left: -180, right: 180 }}
              dragElastic={0.18}
              dragMomentum={false}
              dragSnapToOrigin
              onDragEnd={(_, info) => {
                if (lightboxZoom > 1) return;
                if (info.offset.x <= -56) moveLightbox(1);
                else if (info.offset.x >= 56) moveLightbox(-1);
              }}
              onWheel={handleLightboxWheel}
              onPointerDown={handleLightboxPointerDown}
              onPointerMove={handleLightboxPointerMove}
              onPointerUp={handleLightboxPointerEnd}
              onPointerCancel={handleLightboxPointerEnd}
              onClick={(event) => event.stopPropagation()}
              style={{ touchAction: lightboxZoom > 1 ? "none" : "pan-y" }}
              className="flex h-fit w-fit items-center justify-center overflow-visible rounded-3xl bg-[#e5e7eb] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-2 ring-[#111827]"
            >
              <motion.img
                key={lightboxSrc}
                src={lightboxSrc}
                alt={`Anexo ${currentImage.index + 1}`}
                ref={lightboxImageRef}
                draggable={false}
                onLoad={(event) => handleLightboxImageLoad(event.currentTarget)}
                onDoubleClick={() => {
                  const next = lightboxZoom > 1 ? 1 : 2;
                  setLightboxZoom(next);
                  if (next === 1) setLightboxPan({ x: 0, y: 0 });
                }}
                animate={{
                  scale: lightboxZoom,
                  x: lightboxPan.x,
                  y: lightboxPan.y,
                }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
                style={
                  lightboxImageSize
                    ? {
                        width: `${lightboxImageSize.width}px`,
                        height: `${lightboxImageSize.height}px`,
                      }
                    : { maxWidth: "calc(100vw - 5rem)", maxHeight: "50dvh" }
                }
                className="block h-auto w-auto flex-none select-none rounded-xl border border-[#4b5563]/60 object-contain"
              />
            </motion.div>
          </div>
          <footer className="flex shrink-0 flex-col items-center gap-2 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="glass flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full bg-[#111827]/90 px-2 py-1 text-white">
              <button
                type="button"
                aria-label="Reduzir zoom"
                onClick={() => adjustLightboxZoom(-0.25)}
                disabled={lightboxZoom <= 1}
                className="flex size-11 items-center justify-center rounded-full disabled:opacity-40"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="min-w-14 text-center text-[11px] font-bold">
                <span className="block">{Math.round(lightboxZoom * 100)}%</span>
                <span className="block">{lightboxZoom.toFixed(2)}×</span>
              </span>
              <button
                type="button"
                aria-label="Aumentar zoom"
                onClick={() => adjustLightboxZoom(0.25)}
                disabled={lightboxZoom >= 3}
                className="flex size-11 items-center justify-center rounded-full disabled:opacity-40"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Redefinir zoom"
                onClick={resetLightboxViewport}
                disabled={
                  lightboxZoom === 1 &&
                  lightboxPan.x === 0 &&
                  lightboxPan.y === 0
                }
                className="flex size-11 items-center justify-center rounded-full disabled:opacity-40"
              >
                <RotateCcw className="size-4" />
              </button>
            </div>
            <button
              type="button"
              disabled={downloading}
              onClick={() => void downloadCurrentImage()}
              className="flex min-h-11 w-full max-w-xs items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              <Download className="size-4" />
              {downloading ? "Baixando..." : "Baixar imagem"}
            </button>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
