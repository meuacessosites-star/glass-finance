import type { Category } from "./mock-data";
import { normalizeSearchText } from "./transaction-view";

export const CATEGORY_CATALOG_VERSION = 2;

/** Extra choices only; existing records keep their original category. */
const firstAdditionalCategories: Category[] = [
  {
    id: "supermercado",
    label: "Supermercado",
    color: "#B87824",
    icon: "supermercado",
  },
  {
    id: "restaurantes",
    label: "Restaurantes",
    color: "#E0653C",
    icon: "restaurantes",
  },
  { id: "delivery", label: "Delivery", color: "#C45162", icon: "delivery" },
  {
    id: "combustivel",
    label: "Combustível",
    color: "#CE861C",
    icon: "combustivel",
  },
  {
    id: "estacionamento",
    label: "Estacionamento",
    color: "#49789B",
    icon: "estacionamento",
  },
  { id: "viagens", label: "Viagens", color: "#4877C9", icon: "viagem" },
  { id: "aluguel", label: "Aluguel", color: "#7964B2", icon: "aluguel" },
  { id: "agua", label: "Água", color: "#369BC1", icon: "agua" },
  { id: "energia", label: "Energia", color: "#B99518", icon: "energia" },
  { id: "internet", label: "Internet", color: "#5966AA", icon: "internet" },
  { id: "telefone", label: "Telefone", color: "#538C86", icon: "telefone" },
  { id: "farmacia", label: "Farmácia", color: "#BE6084", icon: "farmacia" },
  {
    id: "cuidados-pessoais",
    label: "Cuidados pessoais",
    color: "#A876A4",
    icon: "beleza",
  },
  { id: "pets", label: "Pets", color: "#A7774B", icon: "pets" },
  { id: "filhos", label: "Filhos", color: "#CD7F9B", icon: "criancas" },
  { id: "presentes", label: "Presentes", color: "#B56893", icon: "presentes" },
  { id: "doacoes", label: "Doações", color: "#B86F69", icon: "doacoes" },
  {
    id: "impostos",
    label: "Impostos e taxas",
    color: "#84745C",
    icon: "impostos",
  },
  { id: "seguros", label: "Seguros", color: "#4D8589", icon: "seguros" },
  {
    id: "manutencao",
    label: "Manutenção",
    color: "#9A7759",
    icon: "manutencao",
  },
  { id: "servicos", label: "Serviços", color: "#697C93", icon: "servicos" },
  {
    id: "investimentos",
    label: "Investimentos",
    color: "#43886E",
    icon: "investimentos",
  },
];

const categoryReleases = [
  { version: 1, categories: firstAdditionalCategories },
  {
    version: 2,
    categories: [
      {
        id: "roupas-calcados",
        label: "Roupas e calçados",
        color: "#C27684",
        icon: "roupas",
      },
      { id: "academia", label: "Academia", color: "#688C42", icon: "academia" },
      { id: "cursos", label: "Cursos", color: "#7E70B8", icon: "formacao" },
      {
        id: "cuidados-carro",
        label: "Cuidados com o carro",
        color: "#557D9B",
        icon: "carro",
      },
      {
        id: "documentos",
        label: "Documentos",
        color: "#9C7A4D",
        icon: "assinaturas",
      },
      {
        id: "trabalho-negocio",
        label: "Trabalho e negócio",
        color: "#527D71",
        icon: "freelance",
      },
    ],
  },
];

export const additionalCategories: Category[] = categoryReleases.flatMap(
  (release) => release.categories,
);

/** Add the new catalog once per profile, preserving all edits and deliberate
 * removals on subsequent loads. IDs and normalized names both prevent duplicates. */
export function expandCategoryCatalog(
  categories: Category[],
  version: unknown,
) {
  const installed =
    typeof version === "number" && Number.isFinite(version)
      ? Math.max(0, Math.floor(version))
      : 0;
  if (installed >= CATEGORY_CATALOG_VERSION)
    return { categories, categoryCatalogVersion: installed };
  const ids = new Set(categories.map((category) => category.id));
  const labels = new Set(
    categories.map((category) => normalizeSearchText(category.label.trim())),
  );
  const additions = categoryReleases
    .filter((release) => release.version > installed)
    .flatMap((release) => release.categories)
    .filter((category) => {
      const label = normalizeSearchText(category.label);
      if (ids.has(category.id) || labels.has(label)) return false;
      ids.add(category.id);
      labels.add(label);
      return true;
    })
    .map((category) => ({ ...category }));
  return {
    categories: additions.length ? [...categories, ...additions] : categories,
    categoryCatalogVersion: CATEGORY_CATALOG_VERSION,
  };
}
