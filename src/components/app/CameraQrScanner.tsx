import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, QrCode, RefreshCw } from "lucide-react";
import jsQR from "jsqr";
import { otsuBinarize } from "@/lib/receipt-scan";

// ---------------------------------------------------------------------------
// CameraQrScanner — live QR reader straight from the browser camera. Every
// frame is drawn to a small canvas and decoded with jsQR (fast path); every
// 2nd frame retries at higher resolution and every 4th frame adds an Otsu
// binarization (low-contrast receipts) plus the native BarcodeDetector API
// when the browser has it (Chrome/Edge/Android), which is far more tolerant
// of small/tilted codes. When a code is found the stream stops, the frame is
// captured as a data URL and handed to the parent for the scrape/parse flow.
// Falls back gracefully to a message when camera access is denied/unavailable.
// ---------------------------------------------------------------------------

const SCAN_W = 640;

export function CameraQrScanner({
  onResult,
  onClose,
}: {
  onResult: (payload: string, frameDataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const frameCountRef = useRef(0);
  const foundRef = useRef(false);
  const nativeRef = useRef<{
    detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
  } | null>(null);
  const nativeBusyRef = useRef(false);

  const [error, setError] = useState("");
  const [found, setFound] = useState<{ payload: string; frame: string } | null>(
    null,
  );
  const aliveRef = useRef(true);

  // Native BarcodeDetector (Chrome/Edge/Android) — muito mais tolerante a QR
  // pequenos ou inclinados que o jsQR. Firefox/Safari não têm: seguem só com
  // jsQR.
  useEffect(() => {
    const w = window as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => {
        detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
      };
    };
    if (typeof w.BarcodeDetector === "function") {
      try {
        nativeRef.current = new w.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        nativeRef.current = null;
      }
    }
  }, []);

  const startCamera = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Este navegador não libera a câmera aqui. Use “Tirar foto” ou “Escolher da galeria”.",
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      if (!aliveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      frameCountRef.current = 0;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      if (aliveRef.current) {
        setError(
          "Não foi possível abrir a câmera. Verifique a permissão no navegador ou use uma foto da galeria.",
        );
      }
    }
  };

  /** Desenha o frame do vídeo num canvas com a largura dada e tenta decodificar
   * com jsQR. Devolve o payload ou null — nunca lança (frame ruim/não pronto). */
  const tryDecode = (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    width: number,
  ): string | null => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    try {
      canvas.width = width;
      canvas.height = Math.round((vh / vw) * width);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const code = jsQR(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
      return code?.data ?? null;
    } catch {
      return null; // frame ruim — continua tentando
    }
  };

  /** Versão binarizada por Otsu do frame — ajuda em cupom desbotado, sombra
   * ou brilho, onde o binarizador interno do jsQR não separa QR do fundo. */
  const tryOtsu = (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    width: number,
  ): string | null => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    try {
      canvas.width = width;
      canvas.height = Math.round((vh / vw) * width);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const code = jsQR(otsuBinarize(data), canvas.width, canvas.height);
      return code?.data ?? null;
    } catch {
      return null;
    }
  };

  /** Encontrou um payload: para a câmera, captura o frame atual em alta
   * resolução (para anexar à transação) e avisa o pai, que segue para o
   * scrape/parse. */
  const onCode = (payload: string) => {
    if (foundRef.current) return;
    foundRef.current = true;
    const video = videoRef.current;
    let frame = "";
    if (video && video.videoWidth > 0) {
      try {
        const bigW = 1200;
        const bigH =
          Math.round((video.videoHeight / video.videoWidth) * bigW) || bigW;
        const big = document.createElement("canvas");
        big.width = bigW;
        big.height = bigH;
        const bctx = big.getContext("2d");
        if (bctx) bctx.drawImage(video, 0, 0, bigW, bigH);
        frame = big.toDataURL("image/jpeg", 0.85);
      } catch {
        frame = "";
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
    setFound({ payload, frame });
  };

  const tick = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || foundRef.current) return;
    frameCountRef.current += 1;
    const n = frameCountRef.current;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      // 640px a cada frame (rápido); em frames pares tenta também 1280px
      // (QR pequenos precisam de mais pixels por módulo); a cada 4 frames,
      // binarização Otsu + BarcodeDetector nativo. Nenhum erro derruba o
      // loop — ele volta a agendar o próximo frame sempre.
      let payload: string | null = null;
      if (n % 2 === 1) {
        payload = tryDecode(video, canvas, SCAN_W);
      } else {
        payload =
          tryDecode(video, canvas, SCAN_W) ??
          tryDecode(video, canvas, SCAN_W * 2);
        if (!payload && n % 4 === 0) payload = tryOtsu(video, canvas, SCAN_W);
      }
      if (payload) {
        onCode(payload);
        return;
      }
      if (n % 4 === 0 && nativeRef.current && !nativeBusyRef.current) {
        nativeBusyRef.current = true;
        nativeRef.current
          .detect(video)
          .then((codes) => {
            const raw = codes?.[0]?.rawValue;
            if (typeof raw === "string" && raw && !foundRef.current) onCode(raw);
          })
          .catch(() => undefined)
          .finally(() => {
            nativeBusyRef.current = false;
          });
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    aliveRef.current = true;
    void startCamera();
    return () => {
      aliveRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      {/* Viewfinder */}
      <div className="relative mx-auto mt-3 w-full max-w-[300px] overflow-hidden rounded-3xl bg-[#0b1630] shadow-[0_18px_44px_-18px_rgba(15,40,90,0.6)]">
        {!error && !found && (
          <>
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className="aspect-[3/4] w-full object-cover"
            />
            {/* Dim the edges so the code stands out in the middle */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_38%,rgba(11,22,48,0.55)_78%)]" />
            {/* Corner brackets */}
            <span className="pointer-events-none absolute left-4 top-4 h-9 w-9 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white/90" />
            <span className="pointer-events-none absolute right-4 top-4 h-9 w-9 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white/90" />
            <span className="pointer-events-none absolute bottom-4 left-4 h-9 w-9 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white/90" />
            <span className="pointer-events-none absolute bottom-4 right-4 h-9 w-9 rounded-br-2xl border-b-[3px] border-r-[3px] border-white/90" />
            <div className="scan-line" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-black/45 px-3 py-1.5 text-[11.5px] font-semibold text-white backdrop-blur">
                Aponte para o QR code da nota
              </span>
            </div>
          </>
        )}

        {error && !found && (
          <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <QrCode className="size-10 text-white/60" />
            <p className="text-[13px] leading-relaxed text-white/85">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-white/15 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/25"
            >
              Voltar
            </button>
          </div>
        )}

        {/* Found state */}
        <AnimatePresence>
          {found && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-4 bg-[#0b1630] px-6 text-center"
            >
              <span className="flex size-14 items-center justify-center rounded-full bg-[#1FBF4F]/20">
                <Check className="size-7 text-[#34C759]" strokeWidth={2.8} />
              </span>
              <div>
                <p className="text-[15px] font-bold text-white">QR code encontrado</p>
                <p className="mt-1 line-clamp-2 break-all text-[11.5px] leading-relaxed text-white/60">
                  {found.payload}
                </p>
              </div>
              <div className="flex w-full gap-2.5">
                <button
                  type="button"
                  onClick={() => onResult(found.payload, found.frame)}
                  className="flex-1 rounded-full bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  Usar esta leitura
                </button>
                <button
                  type="button"
                  aria-label="Escaneie de novo"
                  onClick={() => {
                    setFound(null);
                    foundRef.current = false;
                    frameCountRef.current = 0;
                    setError("");
                    void startCamera();
                  }}
                  className="glass rounded-full px-4 py-3 text-[14px] font-semibold text-white"
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden canvas used by the decode loop */}
      <canvas ref={canvasRef} className="hidden" />

      {!found && !error && (
        <p className="mt-4 px-6 text-center text-[12px] leading-relaxed text-glass-sub">
          O QR das notas fiscais (NFC-e) traz a data de emissão e identifica o
          estabelecimento — o valor é lido da nota na sequência.
        </p>
      )}
    </div>
  );
}
