import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const booksRoot = path.join(projectRoot, "public", "books");
const settingsPath = path.join(booksRoot, "catalog.json");
const outputPath = path.join(booksRoot, "catalog.generated.json");

const naturalSort = new Intl.Collator("fr", {
  numeric: true,
  sensitivity: "base"
}).compare;

async function pngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort(naturalSort);
}

function fallbackTitle(id) {
  return id
    .split("-")
    .map((part) => part.toUpperCase())
    .join(" ");
}

const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const directoryEntries = await readdir(booksRoot, { withFileTypes: true });
const bookIds = directoryEntries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort(naturalSort);

const books = [];

for (const id of bookIds) {
  const baseDirectory = path.join(booksRoot, id);
  const documents = await pngFiles(path.join(baseDirectory, "sans-correction"));
  const corrections = await pngFiles(path.join(baseDirectory, "corrections"));

  if (documents.length !== corrections.length) {
    throw new Error(
      `${id} contient ${documents.length} page(s) sans correction et ${corrections.length} page(s) corrigée(s). Les deux dossiers doivent contenir le même nombre de PNG.`
    );
  }

  const metadata = settings.books?.[id] ?? {};
  books.push({
    id,
    title: metadata.title || fallbackTitle(id),
    fileLabel: metadata.fileLabel || id,
    basePath: `./books/${id}`,
    linksUrl: metadata.linksUrl || `./books/${id}/links.json`,
    pages: documents.map((document, index) => ({
      document,
      correction: corrections[index]
    }))
  });
}

if (!books.some((book) => book.id === settings.defaultBook)) {
  throw new Error(`Le manuel par défaut "${settings.defaultBook}" n’existe pas dans public/books.`);
}

await writeFile(
  outputPath,
  `${JSON.stringify({ version: 1, defaultBook: settings.defaultBook, books }, null, 2)}\n`,
  "utf8"
);

console.log(
  `Catalogue généré : ${books.map((book) => `${book.id} (${book.pages.length} pages)`).join(", ")}`
);
