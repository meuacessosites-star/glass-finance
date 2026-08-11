import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { ThemeToggle } from "./ThemeToggle";

/** Header used by the sidebar settings pages: back chevron + title + theme. */
export function BackHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center justify-between">
      <button
        type="button"
        aria-label="Voltar"
        onClick={() => navigate(-1)}
        className="glass glass-soft flex size-9 items-center justify-center rounded-full text-glass-ink transition-transform active:scale-90"
      >
        <ArrowLeft className="size-[17px]" strokeWidth={2.3} />
      </button>
      <h1 className="text-[20px] font-bold tracking-tight text-foreground">
        {title}
      </h1>
      <ThemeToggle />
    </header>
  );
}
