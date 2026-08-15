import { useRef, useState } from "react";
import {
  Copy,
  Download,
  FileJson,
  Link2,
  RefreshCw,
  Share2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/app/SettingsHeader";
import { useAppStore } from "@/lib/app-store";
import { cn } from "@/lib/utils";

const CODE_PREFIX = "GRANASCAN1:";

const encodeB64 = (s: string) => {
  try {
    return btoa(unescape(encodeURIComponent(s)));
  } catch {
    return "";
  }
};

const decodeB64 = (s: string) => {
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return "";
  }
};

const inputClass =
  "glass glass-soft w-full rounded-2xl px-4 py-3 text-[14px] font-semibold text-glass-ink outline-none placeholder:font-medium placeholder:text-glass-faint focus:ring-2 focus:ring-primary/30";

export default function AccountPage() {
  const { activeProfile, exportState, importState } = useAppStore();
  const [shareCode, setShareCode] = useState("");
  const [importText, setImportText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownload = () => {
    const json = exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `granascan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado", {
      description: "O arquivo .json foi baixado com todos os seus dados.",
    });
  };

  const handleGenerateCode = () => {
    const encoded = encodeB64(exportState());
    if (!encoded) {
      toast("Não foi possível gerar o código");
      return;
    }
    setShareCode(CODE_PREFIX + encoded);
    toast("Código de compartilhamento gerado");
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      toast("Código copiado", {
        description: "Envie para a outra pessoa importar na aba Conta.",
      });
    } catch {
      toast("Não foi possível copiar — selecione e copie manualmente");
    }
  };

  const doImport = (raw: string) => {
    let code = raw.trim();
    if (code.startsWith(CODE_PREFIX)) {
      code = decodeB64(code.slice(CODE_PREFIX.length));
    }
    const result = importState(code);
    if (result.ok) {
      toast("Conta importada com sucesso 🎉", {
        description: "Recarregando seus dados…",
      });
      setTimeout(() => window.location.reload(), 700);
    } else {
      toast("Não foi possível importar", {
        description: result.error ?? "Verifique o código ou arquivo.",
      });
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => doImport(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Conta" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Dados de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        exporte, compartilhe e restaure sua conta quando quiser.
      </p>

      {/* Export */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#2F6BFF]/15">
            <Download className="size-5 text-[#2F6BFF]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-glass-ink">
              Exportar dados
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-glass-sub">
              Baixe um arquivo .json com tudo: perfis, transações, pessoas,
              cartões, reservas, metas, financiamentos e notificações.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <FileJson className="size-4" />
          Baixar backup (.json)
        </button>
      </div>

      {/* Share */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#AF52DE]/15">
            <Share2 className="size-5 text-[#AF52DE]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-glass-ink">
              Compartilhar conta
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-glass-sub">
              Gere um código com um retrato completo da sua conta. A outra
              pessoa importa na aba Conta → Importar e passa a usar os mesmos
              dados.
            </p>
          </div>
        </div>

        {!shareCode ? (
          <button
            type="button"
            onClick={handleGenerateCode}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#AF52DE] py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(175,82,222,0.6)] transition-colors hover:brightness-105 active:scale-[0.98]"
          >
            <Link2 className="size-4" />
            Gerar código de compartilhamento
          </button>
        ) : (
          <>
            <textarea
              readOnly
              value={shareCode}
              rows={3}
              aria-label="Código de compartilhamento"
              className={cn(inputClass, "mt-3 resize-none font-mono text-[11px] leading-relaxed")}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={handleCopyCode}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-black/5 py-3 text-[14px] font-semibold text-glass-ink transition-colors hover:bg-black/10 active:scale-[0.98]"
            >
              <Copy className="size-4" />
              Copiar código
            </button>
          </>
        )}
      </div>

      {/* Import */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#1FBF4F]/15">
            <Upload className="size-5 text-[#17a443]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-glass-ink">
              Importar conta
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-glass-sub">
              Cole um código de compartilhamento ou envie um backup .json. Os
              dados locais serão substituídos pelos importados.
            </p>
          </div>
        </div>

        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          rows={2}
          placeholder="Cole o código GRANASCAN1:… aqui"
          aria-label="Código de importação"
          className={cn(inputClass, "mt-3 resize-none font-mono text-[11px] leading-relaxed")}
        />
        <button
          type="button"
          disabled={!importText.trim()}
          onClick={() => doImport(importText)}
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-[#1FBF4F] py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(31,191,79,0.6)] transition-colors hover:brightness-105 active:scale-[0.98]",
            !importText.trim() && "opacity-50",
          )}
        >
          <RefreshCw className="size-4" />
          Importar código
        </button>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="text-[11px] font-semibold text-glass-faint">ou</span>
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-black/5 py-3 text-[14px] font-semibold text-glass-ink transition-colors hover:bg-black/10 active:scale-[0.98]"
        >
          <FileJson className="size-4" />
          Enviar arquivo .json
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        A importação substitui os dados deste dispositivo pelos do arquivo ou
        código. Faça um backup antes se quiser manter o que está aqui.
      </p>
    </div>
  );
}
