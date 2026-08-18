import { ArrowLeft } from "lucide-react";
import { SidebarTrigger } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

/** Header used by the sidebar settings pages: menu trigger + title + theme.
 *  The hamburger opens the sidebar (with the profile switcher); navigation
 *  back to the tabs is done through the bottom bar. */
export function SettingsHeader({
  title,
  titleClassName = "",
  onBack,
}: {
  title: string;
  titleClassName?: string;
  onBack?: () => void;
}) {
  return (
    <header className="flex items-center justify-between">
      {onBack ? (
        <button
          type="button"
          aria-label="Voltar"
          onClick={onBack}
          className="glass glass-soft flex size-11 shrink-0 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90"
        >
          <ArrowLeft className="size-[17px]" strokeWidth={2.3} />
        </button>
      ) : (
        <SidebarTrigger />
      )}
      <h1 className={`text-[20px] font-bold tracking-tight text-foreground ${titleClassName}`}>
        {title}
      </h1>
      <ThemeToggle />
    </header>
  );
}
