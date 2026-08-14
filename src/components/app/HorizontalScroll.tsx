import {
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { cn } from "@/lib/utils";

/**
 * HorizontalScroll — wrapper que transforma qualquer linha de chips/opções
 * em um scroll horizontal suave:
 *
 *   - `flex flex-nowrap overflow-x-auto` com `gap` passado por uso;
 *   - `touch-pan-x` mantém o arraste nativo no celular (com inércia) sem
 *     roubar a rolagem vertical da tela;
 *   - arrastar com o MOUSE no desktop também rola (pointer events, com o
 *     clique suprimido quando foi um arrasto de verdade);
 *   - a roda do mouse rola a linha horizontalmente em vez da página;
 *   - barra de rolagem escondida (`no-scrollbar` + `-ms-overflow-style`).
 *
 * Uso: <HorizontalScroll className="-mx-5 mt-2 gap-2 px-5 pb-0.5">…chips…</HorizontalScroll>
 */
export function HorizontalScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
    moved: false,
  });

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Touch usa o scroll nativo do navegador (com inércia); o arraste
    // programático é só para mouse no desktop.
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    drag.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      scrollLeft: el.scrollLeft,
      moved: false,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // captura é best-effort
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d.active || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    if (d.moved) el.scrollLeft = d.scrollLeft - dx;
  };

  const stopDrag = () => {
    drag.current.active = false;
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Suprime o clique que dispara logo após um arrasto real.
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onClickCapture={onClickCapture}
      onWheel={onWheel}
      className={cn(
        "no-scrollbar flex flex-nowrap items-center overflow-x-auto touch-pan-x select-none [-ms-overflow-style:none]",
        className,
      )}
    >
      {children}
    </div>
  );
}
