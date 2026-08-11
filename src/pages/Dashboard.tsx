import { useState } from "react";
import { Outlet } from "react-router";
import { AppBackground } from "@/components/app/AppBackground";
import { BottomNav } from "@/components/app/BottomNav";
import { AddMenu } from "@/components/app/AddMenu";
import { HomeIndicator, StatusBar } from "@/components/app/StatusBar";

/**
 * The GranaScan app shell: an iPhone-style frame that hosts the four tabs.
 * On mobile it is edge-to-edge; on desktop it renders as a device bezel.
 */
export default function Dashboard() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-[#e8eefb] dark:bg-[#0a1122] md:flex md:min-h-screen md:items-center md:justify-center md:py-10">
      {/* Device bezel (desktop only) */}
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col md:h-[840px] md:max-h-[92vh] md:rounded-[3.2rem] md:bg-[#0b1220] md:p-[11px] md:shadow-[0_60px_140px_-40px_rgba(15,40,90,0.55)]">
        {/* Screen */}
        <div className="relative flex-1 overflow-hidden md:rounded-[2.55rem]">
          <AppBackground />

          {/* Scrollable content */}
          <main className="no-scrollbar relative z-10 h-full overflow-y-auto overflow-x-hidden">
            <div className="px-5 pb-52 pt-16">
              <Outlet />
            </div>
          </main>

          <StatusBar />
          <BottomNav
            addOpen={addOpen}
            onToggleAdd={() => setAddOpen((open) => !open)}
          />
          <HomeIndicator />
          <AddMenu open={addOpen} onClose={() => setAddOpen(false)} />
        </div>
      </div>
    </div>
  );
}
