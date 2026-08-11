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
} from "lucide-react";
import { categoryById } from "@/lib/mock-data";
import { SquircleIcon } from "./ThemeToggle";

const iconMap: Record<string, LucideIcon> = {
  salario: Wallet,
  freelance: Briefcase,
  alimentacao: UtensilsCrossed,
  transporte: Car,
  moradia: House,
  saude: HeartPulse,
  lazer: Gamepad2,
  compras: ShoppingBag,
  assinaturas: Play,
  educacao: GraduationCap,
  outros: Ellipsis,
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
  const category = categoryById[categoryId] ?? categoryById.outros;
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
