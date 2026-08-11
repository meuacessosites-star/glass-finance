import type { LucideIcon } from "lucide-react";
import {
  Wallet,
  Briefcase,
  UtensilsCrossed,
  Car,
  House,
  HeartPulse,
  Gamepad2,
  ShoppingBag,
  Play,
  GraduationCap,
  Ellipsis,
  PawPrint,
  Plane,
  Gift,
  Coffee,
  Wrench,
  Dumbbell,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { SquircleIcon } from "./ThemeToggle";

/** Icon catalog offered when creating/editing a category. */
export const categoryIconOptions: { id: string; icon: LucideIcon }[] = [
  { id: "salario", icon: Wallet },
  { id: "freelance", icon: Briefcase },
  { id: "alimentacao", icon: UtensilsCrossed },
  { id: "cafe", icon: Coffee },
  { id: "transporte", icon: Car },
  { id: "moradia", icon: House },
  { id: "manutencao", icon: Wrench },
  { id: "saude", icon: HeartPulse },
  { id: "academia", icon: Dumbbell },
  { id: "lazer", icon: Gamepad2 },
  { id: "viagem", icon: Plane },
  { id: "pets", icon: PawPrint },
  { id: "compras", icon: ShoppingBag },
  { id: "presentes", icon: Gift },
  { id: "assinaturas", icon: Play },
  { id: "educacao", icon: GraduationCap },
  { id: "outros", icon: Ellipsis },
];

const iconMap: Record<string, LucideIcon> = Object.fromEntries(
  categoryIconOptions.map((o) => [o.id, o.icon]),
);

const fallbackCategory = {
  id: "outros",
  label: "Outros",
  color: "#8E8E93",
  icon: "outros",
};

export function CategoryIcon({
  categoryId,
  size = "size-11",
  iconSize = "size-[19px]",
}: {
  categoryId: string;
  size?: string;
  iconSize?: string;
}) {
  const { categoryById } = useAppStore();
  const category = categoryById[categoryId] ?? fallbackCategory;
  const Icon = iconMap[category.icon] ?? Ellipsis;
  return (
    <SquircleIcon
      icon={Icon}
      color={category.color}
      size={size}
      iconSize={iconSize}
    />
  );
}
