import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { buildPortableBackup, backupFile, readBackupFile } from "@/lib/portable-backup";
import { localDateKey } from "@/lib/card-billing";
import { inspectBackup } from "@/lib/backup-validation";
import { estimateStorageHealth, formatStorageBytes, LEGACY_SNAPSHOT_LIMIT_BYTES } from "@/lib/storage-health";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import "@/components/app/planning.css";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const convex = useConvex();
  const syncDiagnostics = useQuery(api.financeOwnership.diagnostics);
  const savedHistories = useQuery(api.financeOwnership.listHistoryPreviews);
  const switchHistory = useMutation(api.financeOwnership.switchMine);
  const [historySwitchBusy, setHistorySwitchBusy] = useState(false);
  const openOtherHistory = async (subject: string, epoch: number) => {
    if (historySwitchBusy || cloudSyncStatus !== "synced") {
      toast.error("Confirme a sincronização ou salve um backup antes de trocar o histórico.");
      return;
    }
    if (!window.confirm(
      "Abrir este histórico salvo? O histórico atual e os demais continuarão guardados, sem união ou exclusão. " +
      "Confira que não existem alterações pendentes em nenhum dispositivo. Recomenda-se salvar um backup antes da troca."
    )) return;
    setHistorySwitchBusy(true);
    try {
      await switchHistory({ subject, expectedEpoch: epoch });
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o histórico.");
      setHistorySwitchBusy(false);
    }
  };
  const { user } = useAuth();
  const changeUsername = useMutation(api.users.updateUsername);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameBusy, setUsernameBusy] = useState(false);
  useEffect(() => {
    setUsernameInput(user?.username ?? user?.name ?? "");
  }, [user?.username, user?.name]);

  const saveUsername = async () => {
    if (usernameBusy) return;
    setUsernameBusy(true);
    try {
      await changeUsername({ username: usernameInput });
      toast.success("Nome de usuário atualizado em sua conta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o nome.");
    } finally {
      setUsernameBusy(false);
    }
  };
  const { activeProfile, profiles, restoreTrashedTransaction, storageVersion, migrateFinanceStorage, exportState, importState, cloudSyncStatus, retryCloudSync, deleteCloudData } = useAppStore();
  const storageHealth = useMemo(() => estimateStorageHealth(profiles), [profiles]);
  const [pdfBusy,setPdfBusy]=useState(false);
  const [backupBusy,setBackupBusy]=useState(false);
  const [migrationBusy,setMigrationBusy]=useState(false);
  const [shareCode, setShareCode] = useState("");
  const [importText, setImportText] = useState("");
  const [pendingImport,setPendingImport]=useState<{raw:string;profiles:number;transactions:number;names:string}|null>(null);
  const [lastBackup,setLastBackup]=useState(()=>{try{return localStorage.getItem('granascan:last-backup')??''}catch{return ''}});
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDownload = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const json = await buildPortableBackup(convex, exportState());
      const { blob, extension } = await backupFile(json);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `glass-finance-backup-${new Date().toISOString().slice(0, 10)}${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      const stamp = new Date().toLocaleString("pt-BR");
      setLastBackup(stamp);
      try { localStorage.setItem("granascan:last-backup", stamp); } catch { /* optional */ }
      toast("Backup completo solicitado", {
        description: "Inclui os anexos acessíveis desta conta. Confira se o arquivo foi salvo.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao criar backup completo.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleMigrate = async () => {
    if (migrationBusy || cloudSyncStatus !== "synced" || storageVersion === "v2") return;
    if (!window.confirm(
      "A migração só começa depois de sincronizar tudo. Faça e guarde um backup completo antes de continuar. " +
      "O histórico antigo será mantido como segurança. Deseja iniciar a conferência e migração?"
    )) return;
    setMigrationBusy(true);
    try {
      await migrateFinanceStorage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A migração foi interrompida com segurança.");
    } finally {
      setMigrationBusy(false);
    }
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
  const handleGenerateCode = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const complete = await buildPortableBackup(convex, exportState());
      // The share field is intentionally small; large histories should use a local backup file.
      if (complete.length > 200_000) throw new Error("Dados muito grandes para código. Use o backup em arquivo.");
      const encoded = encodeB64(complete);
      if (!encoded) throw new Error("Não foi possível gerar o código");
      setShareCode(CODE_PREFIX + encoded);
      toast("Código de compartilhamento gerado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o código.");
    } finally {
      setBackupBusy(false);
    }
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

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      doImport(await readBackupFile(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o backup.");
    }
  };

  return (
    <div className="space-y-4">
      <SettingsHeader title="Conta" />
      <section className="glass rounded-3xl p-4" aria-label="Diagnóstico de sincronização entre dispositivos">
        <h2 className="text-[15px] font-semibold text-glass-ink">Sincronização entre dispositivos</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-glass-sub">
          Compare estas informações em cada aparelho, usando exatamente a mesma conta.
          A consulta não modifica seus lançamentos.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px] text-glass-sub">
          <div>
            <dt>Conta</dt>
            <dd className="font-semibold text-glass-ink">{syncDiagnostics?.accountCode ?? "Carregando…"}</dd>
          </div>
          <div>
            <dt>Vínculo à nuvem</dt>
            <dd className="font-semibold text-glass-ink">{syncDiagnostics === undefined ? "Carregando…" : syncDiagnostics?.mapped ? "Vinculado" : "Não concluído"}</dd>
          </div>
          <div>
            <dt>Histórico ativo</dt>
            <dd className="font-semibold text-glass-ink">{syncDiagnostics === undefined ? "Carregando…" : syncDiagnostics?.version === "v2" ? "Individual" : syncDiagnostics?.version === "legacy" ? "Original" : "Sem dados"}</dd>
          </div>
          <div>
            <dt>Revisão salva</dt>
            <dd className="font-semibold text-glass-ink">{syncDiagnostics?.revision ?? "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt>Último salvamento na nuvem</dt>
            <dd className="font-semibold text-glass-ink">{syncDiagnostics?.updatedAt ? new Date(syncDiagnostics.updatedAt).toLocaleString("pt-BR") : "Ainda não registrado"}</dd>
          </div>
        </dl>
        {syncDiagnostics && syncDiagnostics.otherHistoryCount > 0 && (
          <p className="mt-3 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-950">
            Encontramos {syncDiagnostics.otherHistoryCount} histórico(s) de sessões anteriores separado(s) do histórico ativo.
            Eles não foram excluídos nem unidos automaticamente. Faça backups antes de recuperar dados.
          </p>
        )}
        <p className="mt-3 text-[12px] text-glass-sub">
          Situação neste aparelho: <strong className="text-glass-ink">{syncMessage}</strong>
          Se os códigos de conta forem diferentes, não é a mesma conta de acesso.
          Se forem iguais, compare a revisão e a data acima.
        </p>
      </section>
      <section className="glass rounded-3xl p-4" aria-label="Históricos anteriores para recuperação">
        <h2 className="text-[15px] font-semibold text-glass-ink">Recuperar históricos de outros aparelhos</h2>
        <p className="mt-1 text-xs leading-relaxed text-glass-sub">
          Históricos antigos podem conter transações diferentes. Confira a quantidade de perfis e
          transações antes de escolher. O mais recente nem sempre é o que contém seus lançamentos.
          A troca não apaga nem junta os históricos.
        </p>
        {!savedHistories ? (
          <p className="mt-3 text-xs text-glass-sub">Consultando os históricos salvos…</p>
        ) : savedHistories.histories.length === 0 ? (
          <p className="mt-3 text-xs text-glass-sub">Nenhum histórico anterior encontrado nesta conta.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {savedHistories.histories.map((history: { subject: string; selected: boolean; updatedAt: number; version: string; readable: boolean; profileCount: number | null; transactionCount: number | null }, index: number) => (
              <div key={history.subject} className="rounded-2xl border border-black/10 p-3 dark:border-white/15">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-glass-ink">Histórico {index + 1}</p>
                  {history.selected && <span className="text-xs font-semibold text-primary">Aberto agora</span>}
                </div>
                <p className="mt-1 text-xs text-glass-sub">
                  {history.updatedAt ? "Última atualização: " + new Date(history.updatedAt).toLocaleString("pt-BR") : "Data indisponível"}
                </p>
                <p className="mt-1 text-xs font-semibold text-glass-ink">
                  {history.readable
                    ? (history.profileCount ?? "—") + " perfil(is) · " +
                      (history.transactionCount === null ? "contagem de transações indisponível" : history.transactionCount + " transação(ões)")
                    : "Não foi possível conferir os registros deste histórico"}
                </p>
                {!history.selected && (
                  <button type="button"
                    disabled={historySwitchBusy || cloudSyncStatus !== "synced" || !history.readable}
                    onClick={() => { void openOtherHistory(history.subject, savedHistories.epoch); }}
                    className="mt-3 min-h-10 rounded-xl border border-primary px-3 text-xs font-semibold text-primary disabled:opacity-50">
                    {historySwitchBusy ? "Abrindo…" : "Abrir este histórico"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-glass-sub">
          Antes de trocar, salve um backup e confira se todos os dispositivos terminaram de salvar.
          Se houver alterações pendentes, a troca fica bloqueada.
        </p>
      </section>
      <section className="glass rounded-3xl p-4" aria-label="Nome de usuário da conta">
        <h2 className="text-[15px] font-semibold text-glass-ink">Seu nome de usuário</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-glass-sub">
          Este nome aparece no topo da tela inicial e fica salvo na sua conta em todos os dispositivos.
          Não altera o nome dos perfis financeiros nem seu e-mail de acesso.
        </p>
        <label htmlFor="account-username" className="mt-3 block text-xs font-medium text-glass-sub">
          Nome de usuário
        </label>
        <input id="account-username" type="text" minLength={3} maxLength={32}
          autoComplete="nickname" className={cn(inputClass, "mt-1")}
          value={usernameInput} onChange={(event) => setUsernameInput(event.target.value)}
          placeholder="Como deseja aparecer no aplicativo?" />
        <button type="button" disabled={usernameBusy || !usernameInput.trim() ||
            usernameInput.trim() === (user?.username ?? user?.name ?? "").trim()}
          onClick={() => { void saveUsername(); }}
          className="mt-3 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">
          {usernameBusy ? "Salvando…" : "Salvar nome de usuário"}
        </button>
      </section>
      <p className="px-1 text-[12px] font-medium text-glass-faint">
        Dados de{" "}
        <span className="font-bold text-glass-sub">{activeProfile?.name}</span> —
        o backup inclui os {profiles.length} perfis desta conta.
      </p>
      <div role="status" className="glass rounded-2xl p-4">
        <p className="text-sm font-semibold text-glass-ink">{syncMessage}</p>
        {(cloudSyncStatus === "error" || cloudSyncStatus === "conflict") && <button type="button" onClick={retryCloudSync} className="mt-3 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">Tentar sincronizar</button>}
      </div>

      {/* Diagnóstico local: limites do formato antigo, não quota do plano Convex. */}
      <section className="glass rounded-3xl p-4" aria-label="Armazenamento dos dados">
        <p className="text-[15px] font-semibold text-glass-ink">Armazenamento e histórico</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-glass-sub">
          Estimativa dos dados carregados neste dispositivo. Não representa o espaço total da sua conta no Convex.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-glass-sub">
          <div>Transações <strong className="block text-glass-ink">{storageHealth.transactionCount.toLocaleString("pt-BR")}</strong></div>
          <div>Anexos <strong className="block text-glass-ink">{storageHealth.attachmentCount.toLocaleString("pt-BR")}</strong></div>
          <div>Dados estimados <strong className="block text-glass-ink">{formatStorageBytes(storageHealth.totalJsonBytes)}</strong></div>
          <div>Anexos embutidos <strong className="block text-glass-ink">{formatStorageBytes(storageHealth.inlineAttachmentBytes)}</strong></div>
        </div>
        {storageVersion === "legacy" ? (
          <>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" role="progressbar" aria-label="Uso estimado do limite atual de snapshot" aria-valuenow={storageHealth.usagePercent} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full", storageHealth.level === "critical" ? "bg-red-500" : storageHealth.level === "warning" ? "bg-amber-500" : "bg-primary")} style={{ width: `${storageHealth.usagePercent}%` }} />
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-glass-sub">
              {storageHealth.usagePercent}% do limite atual de {formatStorageBytes(LEGACY_SNAPSHOT_LIMIT_BYTES)} por snapshot.
              {storageHealth.level === "critical"
                ? " Atenção: exporte uma cópia e evite novos anexos grandes até concluir a migração."
                : storageHealth.level === "warning"
                  ? " O histórico está crescendo; mantenha backups atualizados."
                  : " O carregamento e o armazenamento ainda dependem do formato antigo."}
            </p>
          </>
        ) : (
          <p className="mt-3 text-[12px] leading-relaxed text-glass-sub">
            Histórico individual ativo. O tamanho acima é uma estimativa local de informações
            carregadas, não o consumo total de arquivos e documentos no Convex.
          </p>
        )}
      </section>

      <section className="glass rounded-3xl p-4">
        <p className="text-[15px] font-semibold text-glass-ink">Histórico preparado para crescer</p>
        {storageVersion === "v2" ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-glass-sub">
            O histórico individual está ativo. Novos lançamentos são armazenados separadamente e
            sincronizados por revisão, sem regravar todos os registros em um único snapshot.
          </p>
        ) : (
          <>
            <p className="mt-2 text-[12.5px] leading-relaxed text-glass-sub">
              O banco ainda usa o formato antigo. Após baixar um backup completo, você pode
              copiar e conferir suas transações antes de ativar o armazenamento individual.
              Durante a migração, mantenha esta página aberta e não altere dados em outro dispositivo.
            </p>
            {import.meta.env.VITE_ENABLE_FINANCE_MIGRATION === "true" ? (
            <button type="button" disabled={migrationBusy || backupBusy || cloudSyncStatus !== "synced"}
              className="mt-3 w-full rounded-full bg-primary px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
              onClick={() => void handleMigrate()}>
              {migrationBusy ? "Preparando migração…" : "Migrar histórico com conferência"}
            </button>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-glass-sub">
                Migração temporariamente indisponível enquanto os testes do banco de dados
                e de recuperação são concluídos.
              </p>
            )}
          </>
        )}
      </section>

      {/* Restauração após excluir um lançamento: o período de retenção é de 30 dias. */}
      <section className="glass rounded-3xl p-4">
        <p className="text-[15px] font-semibold text-glass-ink">Lixeira de transações</p>
        <p className="mt-1 text-[12px] leading-relaxed text-glass-sub">
          Lançamentos apagados ficam disponíveis para recuperação por até 30 dias.
          A exclusão não remove automaticamente comprovantes ainda vinculados a backups.
        </p>
        {profiles.every(profile => !profile.data.trashedTransactions?.length)
          ? <p className="mt-3 text-[12px] text-glass-faint">Nenhum lançamento recuperável.</p>
          : <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
              {profiles.flatMap(profile => (profile.data.trashedTransactions ?? []).map(entry => ({
                entry, profileId: profile.id, profileName: profile.name,
              }))).map(({ entry, profileId, profileName }) => (
                <div key={`${profileId}:${entry.transaction.id}`} className="flex items-center gap-2 rounded-2xl bg-black/5 p-3 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-glass-ink">{entry.transaction.title}</p>
                    <p className="text-[11px] text-glass-sub">{profileName} · Excluída em {new Date(entry.deletedAt).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <button type="button" className="rounded-full bg-primary px-3 py-2 text-[12px] font-semibold text-white" onClick={() => {
                    restoreTrashedTransaction(profileId, entry.transaction.id);
                    toast.success("Lançamento restaurado. Aguarde a sincronização.");
                  }}>Restaurar</button>
                </div>
              ))}
            </div>}
      </section>

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
              no serviço conectado não são copiados; anexos salvos neste aplicativo são incluídos no backup completo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={backupBusy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-[14px] font-semibold text-white shadow-[0_10px_24px_-8px_rgba(47,107,255,0.65)] transition-colors hover:brightness-105 active:scale-[0.98]"
        >
          <FileJson className="size-4" />
          {backupBusy ? "Preparando backup…" : "Baixar backup completo"}
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
            onClick={() => void handleGenerateCode()}
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
          accept="application/json,.json,.gz,application/gzip"
          className="hidden"
          onChange={(e) => {void handleFile(e.target.files?.[0]);e.target.value=""}}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-black/5 py-3 text-[14px] font-semibold text-glass-ink transition-colors hover:bg-black/10 active:scale-[0.98]"
        >
          <FileJson className="size-4" />
          Enviar backup (.json ou .gz)
        </button>
      </div>

      <p className="px-2 text-[12px] leading-relaxed text-glass-faint">
        A importação substitui os dados desta conta pelos do arquivo ou código.
        Faça um backup antes se quiser preservar o que está salvo.
      </p>
      <div className="glass rounded-3xl p-4">
        <p className="text-[15px] font-semibold text-glass-ink">Privacidade e proteção de dados</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-glass-sub">
          Veja como suas informações são utilizadas e saiba como solicitar a exclusão da conta de login.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-[13px] font-medium">
          <a className="text-primary underline underline-offset-4" href="/privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>
          <a className="text-primary underline underline-offset-4" href="/exclusao-de-dados.html" target="_blank" rel="noopener noreferrer">Exclusão de dados e conta</a>
        </div>
      </div>
      <div className="glass rounded-3xl border border-red-500/20 p-4">
        <p className="text-[15px] font-semibold text-glass-ink">Excluir dados financeiros da nuvem</p>
        <p className="mt-1 text-[12px] leading-relaxed text-glass-sub">Apaga perfis, lançamentos, cartões, anexos e contatos financeiros vinculados a esta conta. A conta de login não é excluída.</p>
        <button type="button" onClick={() => void handleDeleteCloudData()} className="mt-3 w-full rounded-full border border-red-500/40 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-500/10 dark:text-red-300">Apagar todos os dados da nuvem</button>
      </div>
      <Dialog open={!!pendingImport} onOpenChange={o=>{if(!o)setPendingImport(null)}}><DialogContent className="planning-dialog"><DialogHeader><DialogTitle>Revisar importação</DialogTitle><DialogDescription>Isso substitui todos os perfis sincronizados da conta, não apenas o perfil aberto. Não altera permissões de acesso ao site.</DialogDescription></DialogHeader>{pendingImport&&<><p>{pendingImport.profiles} perfil(is) · {pendingImport.transactions} transações</p><p className="break-words">{pendingImport.names}</p><p>Faça um backup dos dados atuais antes de continuar. Essa substituição não pode ser desfeita sem um backup.</p><div className="planning-actions"><button onClick={handleDownload}>Baixar backup atual</button><button onClick={()=>setPendingImport(null)}>Cancelar</button><button className="planning-primary" onClick={confirmImport}>Substituir dados e importar</button></div></>}</DialogContent></Dialog>
    </div>
  );
}
