import type { ConvexReactClient } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cloudAttachmentUrl, cloudFileStorageId } from "./cloud-attachments";

const MAX_BACKUP_TEXT = 60_000_000;

function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    output += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(output);
}

/** Exported backups contain the actual files, not temporary signed cloud links. */
export async function buildPortableBackup(client: ConvexReactClient, raw: string): Promise<string> {
  const snapshot: unknown = JSON.parse(raw);
  const resolved = new Map<string, string>();
  async function visit(value: unknown): Promise<unknown> {
    if (typeof value === "string") {
      const storageId = cloudFileStorageId(value);
      if (!storageId) return value;
      const cached = resolved.get(value);
      if (cached) return cached;
      const metadata = await client.query(api.financeFiles.getMetadata, { storageId });
      if (!metadata) throw new Error("O backup foi interrompido: um anexo não pôde ser recuperado");
      const url = await cloudAttachmentUrl(client, value);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Não foi possível incluir um anexo no backup");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const b64 = bytesToBase64(bytes);
      const copy = value.endsWith(":gzip")
        ? `data:application/x-granascan-gzip;mime=${encodeURIComponent(metadata.contentType)};name=${encodeURIComponent(metadata.name)};base64,${b64}`
        : `data:${metadata.contentType};base64,${b64}`;
      resolved.set(value, copy);
      return copy;
    }
    if (Array.isArray(value)) return Promise.all(value.map(visit));
    if (value && typeof value === "object") {
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, child]) => [key, await visit(child)] as const),
      );
      return Object.fromEntries(entries);
    }
    return value;
  }
  const complete = JSON.stringify(await visit(snapshot));
  if (complete.length > MAX_BACKUP_TEXT) {
    throw new Error("O backup completo excede 60 MB. Exporte por períodos antes de prosseguir.");
  }
  return complete;
}

/** Gzip is optional: never create a broken archive when the browser lacks support. */
export async function backupFile(raw: string): Promise<{ blob: Blob; extension: string }> {
  if (typeof CompressionStream !== "undefined" && raw.length > 32_768) {
    const compressed = await new Response(
      new Blob([raw], { type: "application/json" })
        .stream().pipeThrough(new CompressionStream("gzip")),
    ).blob();
    return { blob: compressed, extension: ".json.gz" };
  }
  return { blob: new Blob([raw], { type: "application/json" }), extension: ".json" };
}

export async function readBackupFile(file: File) {
  if (file.size > MAX_BACKUP_TEXT) throw new Error("O arquivo é grande demais para importar");
  if (file.name.endsWith(".gz")) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Este navegador não consegue descompactar backups .gz");
    }
    const raw = await new Response(
      file.stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    if (raw.length > MAX_BACKUP_TEXT) throw new Error("O backup descompactado excede 60 MB");
    return raw;
  }
  return file.text();
}

/** Confirm that the prepared archive round-trips before presenting it as a backup.
 * This verifies bytes in memory, not whether the browser ultimately saved the file.
 */
export async function verifyPreparedBackup(raw: string, blob: Blob, extension: string): Promise<void> {
  const unpacked = extension === ".json.gz"
    ? typeof DecompressionStream === "undefined"
      ? null
      : await new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : await blob.text();
  if (unpacked === null || unpacked !== raw) {
    throw new Error("A verificação do backup falhou. Nenhum arquivo inválido será oferecido.");
  }
}
