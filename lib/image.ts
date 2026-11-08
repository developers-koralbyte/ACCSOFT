// Browser only. Phone photos are often 3 to 8 MB, but hosting platforms such as Vercel
// reject request bodies over about 4.5 MB. Shrinking the photo first keeps the text
// readable for extraction and keeps uploads fast on mobile data.
export async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // unsupported format (for example HEIC in some browsers): send as is
    return file;
  }
}
