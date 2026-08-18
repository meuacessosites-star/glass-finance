import { useCallback, useEffect, useId, useState } from "react";

type OverlayOpenEvent = {
  id: string;
  parentId?: string;
};

type ExclusiveOverlayOptions = {
  name: string;
  open?: boolean;
  defaultOpen?: boolean;
  parentId?: string;
  onOpenChange?: (open: boolean) => void;
};

const OVERLAY_OPEN_EVENT = "glass-finance:overlay-open";

function emitOverlayOpen(id: string, parentId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OverlayOpenEvent>(OVERLAY_OPEN_EVENT, {
      detail: { id, parentId },
    }),
  );
}

function shouldCloseOverlay(
  currentId: string,
  currentParentId: string | undefined,
  source: OverlayOpenEvent,
): boolean {
  if (source.id === currentId) return false;

  // A child popup belongs above its parent and must not close it.
  if (source.parentId === currentId) return false;

  // Opening a parent closes any stale child that was left mounted.
  if (currentParentId === source.id) return true;

  // Menus with the same parent are siblings and are mutually exclusive.
  if (currentParentId === source.parentId) return true;

  // Independent root overlays are also mutually exclusive.
  return true;
}

export function useExclusiveOverlay({
  name,
  open: controlledOpen,
  defaultOpen = false,
  parentId,
  onOpenChange,
}: ExclusiveOverlayOptions) {
  const reactId = useId().replace(/:/g, "");
  const overlayId = `${name}:${reactId}`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const handleOverlayOpen = useCallback(
    (event: Event) => {
      const source = (event as CustomEvent<OverlayOpenEvent>).detail;
      if (!source || !open) return;
      if (shouldCloseOverlay(overlayId, parentId, source)) {
        setOpen(false);
      }
    },
    [open, overlayId, parentId, setOpen],
  );

  useEffect(() => {
    window.addEventListener(OVERLAY_OPEN_EVENT, handleOverlayOpen);
    return () => window.removeEventListener(OVERLAY_OPEN_EVENT, handleOverlayOpen);
  }, [handleOverlayOpen]);

  useEffect(() => {
    if (open) emitOverlayOpen(overlayId, parentId);
  }, [open, overlayId, parentId]);

  const requestOpen = useCallback(() => {
    emitOverlayOpen(overlayId, parentId);
    setOpen(true);
  }, [overlayId, parentId, setOpen]);

  return {
    open,
    overlayId,
    setOpen,
    requestOpen,
  };
}

export type { ExclusiveOverlayOptions };
