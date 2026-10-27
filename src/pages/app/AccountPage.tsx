import { localDateKey } from "@/lib/card-billing";
import { inspectBackup } from "@/lib/backup-validation";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import "@/components/app/planning.css";
import { useRef, useState } from "react";
import {
  Copy,
  Download,
  FileJson,
  FileText,
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
  const { activeProfile, profiles, exportState, importState, cloudSyncStatus, retryCloudSync, deleteCloudData } = useAppStore();
  const [pdfBusy,setPdfBusy]=useState(false);
  const [shareCode, setShareCode] = useState("");
  const [importText, setImportText] = useState("");
  const [pendingImport,setPendingImport]=useState<{raw:string;profiles:number;transactions:number;names:string}|null>(null);
  const [lastBackup,setLastBackup]=useState(()=>{try{return localStorage.getItem('granascan:last-backup')??''}catch{return ''}});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownload = () => {
    const json = exportState();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `granascan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    const stamp = new Date().toLocaleString("pt-BR");
    setLastBackup(stamp);
    toast("Backup exportado", {
      description: "Download solicitado. Confira se o arquivo foi salvo no dispositivo.",
    });
  };

  const handleDeleteCloudData = async () => {
    const confirmed = window.confirm(
      "Apagar permanentemente da nuvem todos os perfis, transações, cartões, empréstimos, anexos e demais dados financeiros desta conta? Essa ação não apaga a conta de login e não pode ser desfeita sem um backup.",
    );
    if (!confirmed) return;
    try {
      await deleteCloudData();
      toast.success("Dados financeiros apagados da nuvem.");
    } catch {
      toast.error("Não foi possível apagar os dados remotos. Tente novamente.");
    }
  };

  const syncMessage = {
    loading: "Conectando à nuvem…",
    synced: "Dados sincronizados com sua conta.",
    saving: "Salvando alterações na nuvem…",
    error: "Há alterações ainda não confirmadas na nuvem.",
    conflict: "Detectamos outra sessão com alterações. Esta versão não foi sobrescrita.",
  }[cloudSyncStatus];

  const handlePdf=async()=>{
    if(!activeProfile||pdfBusy)return;
    setPdfBusy(true);
    try{const {downloadAccountPdf}=await import('@/lib/account-pdf');await downloadAccountPdf(activeProfile,localDateKey());toast.success('PDF gerado. Confira o download no dispositivo.',{duration:2400});}
    catch{toast.error('Não foi possível gerar o PDF. Tente novamente.');}
    finally{setPdfBusy(false);}
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
    try {setPendingImport({raw:code,...inspectBackup(code)});} catch(error){toast.error(error instanceof Error?error.message:'Arquivo inválido.');}
  };
  const confirmImport=()=>{
    if(!pendingImport)return;
    const result = importState(pendingImport.raw);
    if (result.ok) {
      toast("Conta importada com sucesso 🎉", {
        description: "Recarregando seus dados…",
      });
      setPendingImport(null);setTimeout(() => window.location.reload(), 700);
    } else {
      toast("Não foi possível importar", {
        description: result.error ?? "Verifique o código ou arquivo.",
      });
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if(file.size>20_000_000){toast.error("O limite de leitura é 20 MB.");return;}
    const reader = new FileReader();
    reader.onerror=()=>toast.error("Não foi possível ler o arquivo. Tente novamente.");
    reader.onload = () => doImport(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Conta" />
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Dados de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        o backup inclui os {profiles.length} perfis desta conta.
      </p>
      <div role="status" className="glass rounded-2xl p-4">
        <p className="text-sm font-semibold text-glass-ink">{syncMessage}</p>
        {(cloudSyncStatus === "error" || cloudSyncStatus === "conflict") && <button type="button" onClick={retryCloudSync} className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">Tentar sincronizar</button>}
      </div>

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
              Baixe os dados desta conta: perfis, transações, cartões, reservas, metas,
              financiamentos, empréstimos e notificações. Contatos armazenados apenas
              no serviço conectado e anexos externos não são copiados por este arquivo.
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
        <button type="button" disabled={pdfBusy||!activeProfile} onClick={()=>void handlePdf()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#7b45b5] py-3 text-[14px] font-semibold text-white disabled:opacity-50"><FileText className="size-4"/>{pdfBusy?'Gerando relatório…':'Baixar relatório (.pdf)'}</button>
        <p className="mt-2 text-[12px] leading-relaxed text-glass-sub">PDF de {activeProfile?.name}: resumo do mês, transações de todos os períodos, cartões, empréstimos, reservas, metas e cronogramas. Inclui valores completos mesmo com o olhinho fechado, sem PINs ou fotos. É para consulta; somente o JSON permite restaurar os dados.</p>
      </div>

      <p className="planning-notice text-glass-sub">{lastBackup?`Último download solicitado: ${lastBackup}.`:'Você ainda não solicitou um backup neste navegador.'} Guarde o arquivo em um lugar seguro: ele contém informações financeiras e PINs sem criptografia. O backup exportado é uma cópia adicional dos dados sincronizados na nuvem.</p>
      {/* Share */}
      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#AF52DE]/15">
            <Share2 className="size-5 text-[#AF52DE]" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-glass-ink">
              Transferir uma cópia
            </p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-glass-sub">
              Gere um código com os dados locais de todos os perfis. É uma cópia
              daquele momento: não mantém dispositivos sincronizados e não concede
              acesso ao site. O código não é criptografado; compartilhe somente com quem pode ver esses dados.
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
            </button><button className="planning-button mt-2" onClick={()=>setShareCode('')}>Ocultar código</button>
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
              dados desta conta serão substituídos pelos importados.
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
          onChange={(e) => {handleFile(e.target.files?.[0]);e.target.value=""}}
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
        A importação substitui os dados desta conta pelos do arquivo ou código.
        Faça um backup antes se quiser preservar o que está salvo.
      </p>
      <div className="glass rounded-3xl border border-red-500/20 p-4">
        <p className="text-[15px] font-semibold text-glass-ink">Excluir dados financeiros da nuvem</p>
        <p className="mt-1 text-[12px] leading-relaxed text-glass-sub">Apaga perfis, lançamentos, cartões, anexos e contatos financeiros vinculados a esta conta. A conta de login não é excluída.</p>
        <button type="button" onClick={() => void handleDeleteCloudData()} className="mt-3 w-full rounded-full border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300">Apagar todos os dados da nuvem</button>
      </div>
      <Dialog open={!!pendingImport} onOpenChange={o=>{if(!o)setPendingImport(null)}}><DialogContent className="planning-dialog"><DialogHeader><DialogTitle>Revisar importação</DialogTitle><DialogDescription>Isso substitui todos os perfis sincronizados da conta, não apenas o perfil aberto. Não altera permissões de acesso ao site.</DialogDescription></DialogHeader>{pendingImport&&<><p>{pendingImport.profiles} perfil(is) · {pendingImport.transactions} transações</p><p className="break-words">{pendingImport.names}</p><p>Faça um backup dos dados atuais antes de continuar. Essa substituição não pode ser desfeita sem um backup.</p><div className="planning-actions"><button onClick={handleDownload}>Baixar backup atual</button><button onClick={()=>setPendingImport(null)}>Cancelar</button><button className="planning-primary" onClick={confirmImport}>Substituir dados e importar</button></div></>}</DialogContent></Dialog>
    </div>
  );
}
