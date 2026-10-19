import type { LucideIcon } from "lucide-react";
import {
  Baby,
  ShoppingCart,
  Truck,
  Sandwich,
  IceCreamBowl,
  CakeSlice,
  Soup,
  Dog,
  Bird,
  Fish,
  HandHeart,
  School,
  GraduationCap,
  BookMarked,
  Scissors,
  Sparkles,
  Palette,
  Hospital,
  TestTube2,
  Thermometer,
  TrainFront,
  Ship,
  CircleParking,
  Hotel,
  Luggage,
  Hammer,
  Paintbrush,
  Flower2,
  Sofa,
  BedDouble,
  CookingPot,
  ShieldCheck,
  BadgeDollarSign,
  Phone,
  Handshake,
  Drill,
  Volleyball,
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
export const categoryIconOptions: {
  id: string;
  icon: LucideIcon;
  label: string;
}[] = [
  { id: "salario", icon: Wallet, label: "Salário" },
  { id: "freelance", icon: Briefcase, label: "Trabalho e freelance" },
  { id: "dinheiro", icon: Banknote, label: "Dinheiro" },
  { id: "moedas", icon: Coins, label: "Moedas" },
  { id: "cartao", icon: CreditCard, label: "Cartão" },
  { id: "investimentos", icon: Landmark, label: "Investimentos" },
  { id: "emprestimos", icon: HandCoins, label: "Empréstimos" },
  { id: "poupanca", icon: PiggyBank, label: "Poupança" },
  { id: "recebimentos", icon: CircleDollarSign, label: "Recebimentos" },
  { id: "alimentacao", icon: Utensils, label: "Alimentação" },
  { id: "restaurantes", icon: Pizza, label: "Restaurantes" },
  { id: "cafe", icon: Coffee, label: "Café" },
  { id: "transporte", icon: Car, label: "Transporte" },
  { id: "carro", icon: CarFront, label: "Carro" },
  { id: "onibus", icon: BusFront, label: "Ônibus" },
  { id: "bicicleta", icon: Bike, label: "Bicicleta" },
  { id: "combustivel", icon: Fuel, label: "Combustível" },
  { id: "moradia", icon: House, label: "Moradia" },
  { id: "condominio", icon: Building2, label: "Condomínio" },
  { id: "aluguel", icon: KeyRound, label: "Aluguel" },
  { id: "energia", icon: Lightbulb, label: "Energia" },
  { id: "agua", icon: Droplets, label: "Água" },
  { id: "internet", icon: Wifi, label: "Internet" },
  { id: "manutencao", icon: Wrench, label: "Manutenção" },
  { id: "saude", icon: HeartPulse, label: "Saúde" },
  { id: "medico", icon: Stethoscope, label: "Médico" },
  { id: "farmacia", icon: Pill, label: "Farmácia" },
  { id: "academia", icon: Dumbbell, label: "Academia" },
  { id: "lazer", icon: Gamepad2, label: "Lazer e jogos" },
  { id: "filmes", icon: Film, label: "Filmes" },
  { id: "musica", icon: Music2, label: "Música" },
  { id: "eventos", icon: Ticket, label: "Eventos" },
  { id: "premios", icon: Trophy, label: "Prêmios" },
  { id: "viagem", icon: Plane, label: "Viagem" },
  { id: "localizacao", icon: MapPin, label: "Localização" },
  { id: "pets", icon: PawPrint, label: "Pets" },
  { id: "gato", icon: Cat, label: "Gato" },
  { id: "compras", icon: ShoppingBag, label: "Compras" },
  { id: "roupas", icon: Shirt, label: "Roupas" },
  { id: "eletronicos", icon: Smartphone, label: "Eletrônicos" },
  { id: "computador", icon: Laptop, label: "Computador" },
  { id: "presentes", icon: Gift, label: "Presentes" },
  { id: "educacao", icon: BookOpen, label: "Educação" },
  { id: "criancas", icon: Baby, label: "Crianças" },
  { id: "natureza", icon: Leaf, label: "Natureza" },
  { id: "jardinagem", icon: Sprout, label: "Jardinagem" },
  { id: "anotacoes", icon: Pencil, label: "Anotações" },
  { id: "assinaturas", icon: ReceiptText, label: "Assinaturas" },
  { id: "outros", icon: Ellipsis, label: "Outros" },
  { id: "supermercado", icon: ShoppingCart, label: "Supermercado" },
  { id: "delivery", icon: Truck, label: "Delivery e entregas" },
  { id: "lanche", icon: Sandwich, label: "Lanches" },
  { id: "sorvete", icon: IceCreamBowl, label: "Sorvete" },
  { id: "bolo", icon: CakeSlice, label: "Bolos e festas" },
  { id: "refeicoes", icon: Soup, label: "Refeições" },
  { id: "cachorro", icon: Dog, label: "Cachorro" },
  { id: "passaro", icon: Bird, label: "Pássaro" },
  { id: "peixe", icon: Fish, label: "Peixe" },
  { id: "doacoes", icon: HandHeart, label: "Doações" },
  { id: "escola", icon: School, label: "Escola" },
  { id: "formacao", icon: GraduationCap, label: "Formação e cursos" },
  { id: "material-escolar", icon: BookMarked, label: "Material escolar" },
  { id: "beleza", icon: Scissors, label: "Salão e beleza" },
  { id: "cosmeticos", icon: Sparkles, label: "Cosméticos" },
  { id: "arte", icon: Palette, label: "Arte" },
  { id: "hospital", icon: Hospital, label: "Hospital" },
  { id: "exames", icon: TestTube2, label: "Exames" },
  { id: "temperatura", icon: Thermometer, label: "Termômetro" },
  { id: "trem", icon: TrainFront, label: "Trem" },
  { id: "barco", icon: Ship, label: "Barco" },
  { id: "estacionamento", icon: CircleParking, label: "Estacionamento" },
  { id: "hotel", icon: Hotel, label: "Hotel" },
  { id: "bagagem", icon: Luggage, label: "Bagagem" },
  { id: "reforma", icon: Hammer, label: "Reforma" },
  { id: "pintura", icon: Paintbrush, label: "Pintura" },
  { id: "flores", icon: Flower2, label: "Flores" },
  { id: "moveis", icon: Sofa, label: "Móveis" },
  { id: "quarto", icon: BedDouble, label: "Quarto" },
  { id: "cozinha", icon: CookingPot, label: "Cozinha" },
  { id: "seguros", icon: ShieldCheck, label: "Seguros" },
  { id: "impostos", icon: BadgeDollarSign, label: "Impostos e taxas" },
  { id: "telefone", icon: Phone, label: "Telefone" },
  { id: "servicos", icon: Handshake, label: "Serviços" },
  { id: "ferramentas", icon: Drill, label: "Ferramentas" },
  { id: "esporte", icon: Volleyball, label: "Esportes" },
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
