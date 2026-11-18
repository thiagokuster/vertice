import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, { ext: string; check: (bytes: Buffer) => boolean }> = {
  "image/jpeg": {
    ext: "jpg",
    check: (bytes) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/png": {
    ext: "png",
    check: (bytes) =>
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47,
  },
  "image/webp": {
    ext: "webp",
    check: (bytes) =>
      bytes.length > 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP",
  },
};

export async function saveProductImage(file: File) {
  const rule = TYPES[file.type];
  if (!rule) throw new Error("Envie uma imagem JPG, PNG ou WebP.");
  if (file.size > 2 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!rule.check(bytes)) throw new Error("O arquivo enviado não é uma imagem válida.");
  const name = `${crypto.randomUUID()}.${rule.ext}`;
  const directory = path.join(process.cwd(), "public", "uploads");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, name), bytes);
  return `/uploads/${name}`;
}

export async function removeUpload(publicPath: string | null | undefined) {
  if (!publicPath?.startsWith("/uploads/")) return;
  const name = path.basename(publicPath);
  await unlink(path.join(process.cwd(), "public", "uploads", name)).catch(() => undefined);
}
