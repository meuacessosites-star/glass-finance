import {
  useEffect,
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
 *     clique suprimido apenas quando foi um arrasto de verdade);
 *   - a roda do mouse rola a linha horizontalmente em vez da página;
 *   - barra de rolagem escondida (`no-scrollbar` + `-ms-overflow-style`).
 *
 * IMPORTANTE: o arraste NÃO usa `setPointerCapture`. Capturar o ponteiro
 * redireciona o evento `click` para o container e impede o `onClick` dos
 * botões internos (pílulas de categoria, anexos etc.). Em vez disso, os
 * movimentos são rastreados no `window` durante o arrasto, o que preserva
 * o scroll suave e deixa o clique chegar normalmente no botão.
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

  // Rastreia o arrasto do mouse no `window` para continuar rolando mesmo
  // quando o cursor sai do elemento — sem capturar o ponteiro.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onPointerMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 4) d.moved = true;
      if (d.moved) el.scrollLeft = d.scrollLeft - dx;
    };

    const stopDrag = () => {
      drag.current.active = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, []);

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
  };

  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Suprime apenas o clique que dispara logo após um arrasto real.
    // Cliques simples passam direto para o onClick do botão.
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
