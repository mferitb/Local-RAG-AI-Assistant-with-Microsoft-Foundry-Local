/**
 * Ingestion script.
 * Reads all markdown documents from the docs/ folder,
 * chunks them, and stores in the local SQLite vector store.
 *
 * Usage: node src/ingest.js
 */
import fs from "fs";
import path from "path";
import { config } from "./config.js";
import { parseFrontMatter, chunkText } from "./chunker.js";
import { VectorStore } from "./vectorStore.js";

async function ingest() {
  console.log("=== Local RAG – Document Ingestion ===\n");

  const docsDir = config.docsDir;
  if (!fs.existsSync(docsDir)) {
    console.error(`Docs directory not found: ${docsDir}`);
    console.error("Please create a 'docs/' folder and add markdown (.md) files.");
    process.exit(1);
  }

  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.error("No markdown files found in docs/");
    console.error("Add .md files to the docs/ folder and run this script again.");
    process.exit(1);
  }

  console.log(`Found ${files.length} markdown file(s)\n`);

  const store = new VectorStore(config.dbPath);
  await store.open();
  store.clear();
  console.log("Cleared existing chunks from database.\n");

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(docsDir, file);
    const raw = fs.readFileSync(filePath, "utf8");

    const { meta, body } = parseFrontMatter(raw);
    const docId = meta.id || path.basename(file, ".md");
    const title = meta.title || docId;
    const category = meta.category || null;

    const chunks = chunkText(body, config.chunkSize, config.chunkOverlap);
    let chunkIndex = 0;

    for (const chunk of chunks) {
      store.insert(docId, title, category, chunkIndex, chunk);
      chunkIndex++;
    }

    totalChunks += chunks.length;
    console.log(`✓ ${file} → ${chunks.length} chunk(s) [title: "${title}"]`);
  }

  console.log(`\nIngestion complete: ${totalChunks} chunks from ${files.length} file(s)`);
  store.close();
}

ingest().catch((err) => {
  console.error("Ingestion failed:", err.message);
  process.exit(1);
});
