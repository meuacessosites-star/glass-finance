import { SidebarTrigger } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

/** Header used by the sidebar settings pages: menu trigger + title + theme.
 *  The hamburger opens the sidebar (with the profile switcher); navigation
 *  back to the tabs is done through the bottom bar. */
export function SettingsHeader({ title }: { title: string }) {
  return (
    <header className="flex items-center justify-between">
      <SidebarTrigger />
      <h1 className="text-[20px] font-bold tracking-tight text-foreground">
        {title}
      </h1>
      <ThemeToggle />
    </header>
  );
}
