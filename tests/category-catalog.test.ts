import { test } from "node:test";
import assert from "node:assert/strict";
import {
  additionalCategories,
  expandCategoryCatalog,
} from "../src/lib/category-catalog";
import { categories, type Category } from "../src/lib/mock-data";

test("expanded defaults retain every original category in place without duplicate identifiers", () => {
  assert.deepEqual(
    categories.slice(0, 11).map((category) => category.id),
    [
      "salario",
      "freelance",
      "alimentacao",
      "transporte",
      "moradia",
      "saude",
      "lazer",
      "compras",
      "assinaturas",
      "educacao",
      "outros",
    ],
  );
  assert.equal(categories.length, 39);
  assert.equal(
    new Set(categories.map((category) => category.id)).size,
    categories.length,
  );
});

test("existing profile categories keep their IDs, order, edits and images; ID and normalized name collisions are not added", () => {
  const saved: Category[] = [
    {
      id: "moradia",
      label: "Minha casa",
      color: "#123456",
      icon: "aluguel",
      image: "data:image/png;base64,saved",
    },
    { id: "mine", label: "  FARMACIA  ", color: "#654321", icon: "poupanca" },
    {
      id: "pets",
      label: "Cuidados do cachorro",
      color: "#112233",
      icon: "gato",
    },
  ];
  const before = JSON.stringify(saved);
  const result = expandCategoryCatalog(saved, undefined);
  assert.deepEqual(result.categories.slice(0, 3), saved);
  assert.equal(result.categories[0], saved[0]);
  assert.equal(
    result.categories.filter((category) => category.id === "pets").length,
    1,
  );
  assert.equal(
    result.categories.some((category) => category.id === "farmacia"),
    false,
  );
  assert.equal(
    result.categories.length,
    saved.length + additionalCategories.length - 2,
  );
  assert.equal(JSON.stringify(saved), before);
});

test("after first installation, reload/import does not restore a deliberately removed new category", () => {
  const first = expandCategoryCatalog([], 0);
  const removed = first.categories.filter(
    (category) => category.id !== "delivery",
  );
  const imported = JSON.parse(
    JSON.stringify({
      categories: removed,
      categoryCatalogVersion: first.categoryCatalogVersion,
    }),
  );
  const second = expandCategoryCatalog(
    imported.categories,
    imported.categoryCatalogVersion,
  );
  assert.equal(
    second.categories.some((category) => category.id === "delivery"),
    false,
  );
  assert.equal(second.categories.length, additionalCategories.length - 1);
  assert.equal(second.categories, imported.categories);
});

test("profiles get independent new choices without sharing edited category objects or altering financial records", () => {
  const transactions = [{ id: "bill", amount: -123.45, categoryId: "moradia" }];
  const profiles = [
    { categories: [] as Category[], transactions, limit: 500 },
    { categories: [] as Category[], transactions: [], limit: null },
  ];
  const updated = profiles.map((profile) => ({
    ...profile,
    ...expandCategoryCatalog(profile.categories, 0),
  }));
  assert.equal(updated[0].transactions, transactions);
  assert.equal(updated[0].limit, 500);
  assert.equal(updated[1].limit, null);
  assert.notEqual(updated[0].categories, updated[1].categories);
  updated[0].categories[0].color = "#112233";
  assert.notEqual(updated[1].categories[0].color, "#112233");
  assert.notEqual(additionalCategories[0].color, "#112233");
  assert.equal(profiles[0].categories.length, 0);
});

test("catalog installation handles legacy or malformed versions while preserving later versions", () => {
  for (const version of [undefined, null, "1", NaN, Infinity, -2]) {
    const migrated = expandCategoryCatalog([], version);
    assert.equal(migrated.categoryCatalogVersion, 2);
    assert.equal(migrated.categories.length, additionalCategories.length);
  }
  const custom: Category[] = [
    { id: "custom", label: "Especial", color: "#112233", icon: "outros" },
  ];
  const future = expandCategoryCatalog(custom, 3);
  assert.equal(future.categories, custom);
  assert.equal(future.categoryCatalogVersion, 3);
});

test("the six-category update preserves deleted earlier choices and existing personalized categories", () => {
  const before = categories
    .slice(0, 33)
    .filter((category) => category.id !== "delivery")
    .map((category) => ({ ...category }));
  before[0].label = "Meu salário";
  before[0].color = "#123456";
  const result = expandCategoryCatalog(before, 1);
  assert.deepEqual(result.categories.slice(0, before.length), before);
  assert.equal(
    result.categories.some((category) => category.id === "delivery"),
    false,
  );
  assert.deepEqual(
    result.categories.slice(before.length).map((category) => category.label),
    [
      "Roupas e calçados",
      "Academia",
      "Cursos",
      "Cuidados com o carro",
      "Documentos",
      "Trabalho e negócio",
    ],
  );
  assert.equal(result.categoryCatalogVersion, 2);
});

test("the six-category update respects a custom category with the same normalized label", () => {
  const existing: Category[] = [
    {
      id: "my-courses",
      label: "  CURSOS  ",
      color: "#112233",
      icon: "educacao",
      image: "data:image/png;base64,mine",
    },
  ];
  const result = expandCategoryCatalog(existing, 1);
  assert.equal(result.categories.length, 6);
  assert.equal(result.categories[0], existing[0]);
  assert.equal(
    result.categories.some((category) => category.id === "cursos"),
    false,
  );
  const reloaded = expandCategoryCatalog(
    result.categories,
    result.categoryCatalogVersion,
  );
  assert.equal(reloaded.categories, result.categories);
});
