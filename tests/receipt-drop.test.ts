import assert from "node:assert/strict";
import { test } from "node:test";
import { firstDroppedReceiptImage, isReceiptImageFile } from "../src/lib/receipt-drop";

test("accepts common raster images by MIME type", () => {
  assert.equal(isReceiptImageFile({ name: "nota.webp", type: "image/webp" }), true);
  assert.equal(isReceiptImageFile({ name: "foto.jpg", type: "image/jpeg" }), true);
});
test("accepts common image extensions when MIME is missing", () => {
  assert.equal(isReceiptImageFile({ name: "RECIBO.PNG", type: "" }), true);
});
test("rejects files with non-image MIME even if extension looks like an image", () => {
  assert.equal(isReceiptImageFile({ name: "nota.png", type: "application/pdf" }), false);
});
test("selects the first image from a mixed drop", () => {
  const images = [
    { name: "dados.pdf", type: "application/pdf" },
    { name: "foto.jpeg", type: "image/jpeg" },
    { name: "outra.png", type: "image/png" },
  ];
  assert.equal(firstDroppedReceiptImage(images), images[1]);
});
test("does not process a drop without images", () => {
  assert.equal(firstDroppedReceiptImage([{ name: "planilha.xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }]), null);
  assert.equal(firstDroppedReceiptImage([]), null);
});
