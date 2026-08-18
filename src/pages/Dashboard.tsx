import { useState } from "react";
import { Outlet, useLocation } from "react-router";
import { AppBackground } from "@/components/app/AppBackground";
import { BottomNav } from "@/components/app/BottomNav";
import { AddMenu } from "@/components/app/AddMenu";
import { AddTransactionSheet } from "@/components/app/AddTransactionSheet";
import { LoanTransactionSheet } from "@/components/app/LoanTransactionSheet";
import { ScanReceiptSheet } from "@/components/app/ScanReceiptSheet";
import { VoiceCommandSheet } from "@/components/app/VoiceCommandSheet";
import { PinLock } from "@/components/app/PinLock";
import { Sidebar, SidebarProvider } from "@/components/app/Sidebar";
import { HomeIndicator } from "@/components/app/StatusBar";
import { DueTodayAlerts } from "@/components/app/DueTodayAlerts";
import { AppStoreProvider, useAppStore } from "@/lib/app-store";

/**
 * The GranaScan app shell: a fluid viewport-native layout that hosts the app.
 */
function DashboardShell() {
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [loanOpen, setLoanOpen] = useState(false);
  const { pathname } = useLocation();
  const isTransactionEdit =
    pathname.startsWith("/dashboard/transacoes/") && pathname.endsWith("/editar");
  const { activeProfile, pinUsage } = useAppStore();

  // Lock on app open only when the active profile has a PIN AND the "Uso do
  // PIN" setting asks for it on entry ("open"). Switching profiles has its own
  // PIN gate (in the menu and on the Perfis screen), so it must NOT re-trigger
  // this lock.
  const appLock = Boolean(activeProfile?.data.pin) && pinUsage === "open";
  const [appUnlocked, setAppUnlocked] = useState(() => !appLock);

  return (
    <div className="min-h-screen w-full bg-[#e8eefb] dark:bg-[#0a1122]">
      <div
        id="app-screen"
        className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col overflow-hidden"
      >
          {!isTransactionEdit && <AppBackground />}

          {/* Scrollable content */}
          <main className="no-scrollbar relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
            <div className={isTransactionEdit ? "h-full" : "px-5 pb-52"}>
              <Outlet />
            </div>
          </main>

          {!isTransactionEdit && <DueTodayAlerts />}
          {!isTransactionEdit && (
            <BottomNav
              addOpen={addOpen}
              onToggleAdd={() => setAddOpen((open) => !open)}
            />
          )}
          {!isTransactionEdit && <HomeIndicator />}
          {!isTransactionEdit && (
            <AddMenu
              open={addOpen}
              onClose={() => setAddOpen(false)}
              onManual={() => setManualOpen(true)}
              onScan={() => setScanOpen(true)}
              onVoice={() => setVoiceOpen(true)}
              onLoan={() => setLoanOpen(true)}
            />
          )}
          {!isTransactionEdit && (
            <AddTransactionSheet
              open={manualOpen}
              onClose={() => setManualOpen(false)}
            />
          )}
          {!isTransactionEdit && (
            <ScanReceiptSheet
              open={scanOpen}
              onClose={() => setScanOpen(false)}
            />
          )}
          {!isTransactionEdit && (
            <VoiceCommandSheet
              open={voiceOpen}
              onClose={() => setVoiceOpen(false)}
            />
          )}
          {!isTransactionEdit && (
            <LoanTransactionSheet
              open={loanOpen}
              onClose={() => setLoanOpen(false)}
            />
          )}

          {/* Sidebar + PIN lock (on top of everything) */}
          {!isTransactionEdit && <Sidebar />}
          {appLock && !appUnlocked && (
            <PinLock onUnlocked={() => setAppUnlocked(true)} />
          )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <AppStoreProvider>
      <SidebarProvider>
        <DashboardShell />
      </SidebarProvider>
    </AppStoreProvider>
  );
}
