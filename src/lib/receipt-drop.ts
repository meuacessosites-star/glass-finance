/** Image type guard shared by file pickers and drag-and-drop.
 * Some desktop file managers omit the MIME type, so common raster extensions
 * are accepted only when the MIME type is empty.
 */
export function isReceiptImageFile(file: Pick<File, "name" | "type">): boolean {
  if (file.type) return file.type.startsWith("image/");
  return /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name);
}

export function firstDroppedReceiptImage<T extends Pick<File, "name" | "type">>(
  files: ArrayLike<T>,
): T | null {
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    if (file && isReceiptImageFile(file)) return file;
  }
  return null;
}
