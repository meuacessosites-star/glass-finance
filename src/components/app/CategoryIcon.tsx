import type { LucideIcon } from "lucide-react";
import {
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  BusFront,
  Car,
  CarFront,
  Cat,
  CircleDollarSign,
  Coins,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  Ellipsis,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  HandCoins,
  HeartPulse,
  House,
  KeyRound,
  Laptop,
  Landmark,
  Leaf,
  Lightbulb,
  MapPin,
  Music2,
  PawPrint,
  Pencil,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  ReceiptText,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sprout,
  Stethoscope,
  Ticket,
  Trophy,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
} from "lucide-react";
import { useAppStore } from "@/lib/app-store";
import { SquircleIcon } from "./ThemeToggle";

/** Icon catalog offered when creating/editing a category. */
export const categoryIconOptions: { id: string; icon: LucideIcon }[] = [
  { id: "salario", icon: Wallet },
  { id: "freelance", icon: Briefcase },
  { id: "dinheiro", icon: Banknote },
  { id: "moedas", icon: Coins },
  { id: "cartao", icon: CreditCard },
  { id: "investimentos", icon: Landmark },
  { id: "emprestimos", icon: HandCoins },
  { id: "poupanca", icon: PiggyBank },
  { id: "recebimentos", icon: CircleDollarSign },
  { id: "alimentacao", icon: Utensils },
  { id: "restaurantes", icon: Pizza },
  { id: "cafe", icon: Coffee },
  { id: "transporte", icon: Car },
  { id: "carro", icon: CarFront },
  { id: "onibus", icon: BusFront },
  { id: "bicicleta", icon: Bike },
  { id: "combustivel", icon: Fuel },
  { id: "moradia", icon: House },
  { id: "condominio", icon: Building2 },
  { id: "aluguel", icon: KeyRound },
  { id: "energia", icon: Lightbulb },
  { id: "agua", icon: Droplets },
  { id: "internet", icon: Wifi },
  { id: "manutencao", icon: Wrench },
  { id: "saude", icon: HeartPulse },
  { id: "medico", icon: Stethoscope },
  { id: "farmacia", icon: Pill },
  { id: "academia", icon: Dumbbell },
  { id: "lazer", icon: Gamepad2 },
  { id: "filmes", icon: Film },
  { id: "musica", icon: Music2 },
  { id: "eventos", icon: Ticket },
  { id: "premios", icon: Trophy },
  { id: "viagem", icon: Plane },
  { id: "localizacao", icon: MapPin },
  { id: "pets", icon: PawPrint },
  { id: "gato", icon: Cat },
  { id: "compras", icon: ShoppingBag },
  { id: "roupas", icon: Shirt },
  { id: "eletronicos", icon: Smartphone },
  { id: "computador", icon: Laptop },
  { id: "presentes", icon: Gift },
  { id: "educacao", icon: BookOpen },
  { id: "criancas", icon: Baby },
  { id: "natureza", icon: Leaf },
  { id: "jardinagem", icon: Sprout },
  { id: "anotacoes", icon: Pencil },
  { id: "assinaturas", icon: ReceiptText },
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
  strokeWidth = 2.2,
  useImage = true,
  backgroundColor,
  className,
}: {
  categoryId: string;
  size?: string;
  iconSize?: string;
  strokeWidth?: number;
  useImage?: boolean;
  backgroundColor?: string;
  className?: string;
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
      image={useImage ? category.image : undefined}
      backgroundColor={backgroundColor}
      className={className}
      strokeWidth={strokeWidth}
    />
  );
}
