/**
 * Local vector store backed by SQLite (via sql.js — pure JavaScript, no native compilation).
 * Stores document chunks and their term-frequency vectors for offline RAG retrieval.
 *
 * Performance optimisations:
 * - Inverted index: maps terms → chunk indices for fast candidate filtering
 * - Row cache: parsed TF maps kept in memory to avoid JSON.parse on every query
 * - WAL-like persistence: saves the database to disk on every mutation
 */
import initSqlJs from "sql.js";
import path from "path";
import fs from "fs";
import { termFrequency, cosineSimilarity } from "./chunker.js";

let _SQL = null;
async function getSql() {
  if (!_SQL) _SQL = await initSqlJs();
  return _SQL;
}

export class VectorStore {
  /**
   * @param {string} dbPath  Path to the SQLite database file
   */
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    // Ensure data directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // In-memory caches for fast retrieval
    this._rowCache = null;
    this._invertedIndex = null;
  }

  /** Open (or create) the database. Must be called before any other method. */
  async open() {
    const SQL = await getSql();

    if (fs.existsSync(this.dbPath)) {
      const buf = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buf);
    } else {
      this.db = new SQL.Database();
    }

    this._init();
    return this;
  }

  _init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doc_id TEXT NOT NULL,
        title TEXT,
        category TEXT,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        tf_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_doc_id ON chunks(doc_id);
    `);
    this._save();
  }

  /** Persist the database to disk. */
  _save() {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  /** Invalidate in-memory caches. */
  _invalidateCache() {
    this._rowCache = null;
    this._invertedIndex = null;
  }

  /** Run a query and return all rows as plain objects. */
  _all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /** Run a query that returns a single value. */
  _get(sql, params = []) {
    const rows = this._all(sql, params);
    return rows[0] || null;
  }

  /** Build or return the in-memory row cache and inverted index. */
  _ensureCache() {
    if (this._rowCache) return;

    const rows = this._all("SELECT * FROM chunks");
    this._rowCache = rows.map((row) => {
      const tf = new Map(JSON.parse(row.tf_json));
      return {
        id: row.id,
        doc_id: row.doc_id,
        title: row.title,
        category: row.category,
        content: row.content,
        tf,
      };
    });

    // Build inverted index: term → set of row indices
    this._invertedIndex = new Map();
    for (let i = 0; i < this._rowCache.length; i++) {
      for (const term of this._rowCache[i].tf.keys()) {
        if (!this._invertedIndex.has(term)) {
          this._invertedIndex.set(term, new Set());
        }
        this._invertedIndex.get(term).add(i);
      }
    }
  }

  /** Remove all existing chunks. */
  clear() {
    this.db.run("DELETE FROM chunks");
    this._save();
    this._invalidateCache();
  }

  /** Insert a single chunk. */
  insert(docId, title, category, chunkIndex, content) {
    const tf = termFrequency(content);
    const tfJson = JSON.stringify([...tf]);
    this.db.run(
      "INSERT INTO chunks (doc_id, title, category, chunk_index, content, tf_json) VALUES (?, ?, ?, ?, ?, ?)",
      [docId, title, category, chunkIndex, content, tfJson]
    );
    this._save();
    this._invalidateCache();
  }

  /** Retrieve top-K most relevant chunks for a query. */
  search(query, topK = 5) {
    const queryTf = termFrequency(query);
    this._ensureCache();

    // Use inverted index to find candidate chunks that share at least one term
    const candidateIndices = new Set();
    for (const term of queryTf.keys()) {
      const indices = this._invertedIndex.get(term);
      if (indices) {
        for (const idx of indices) candidateIndices.add(idx);
      }
    }

    const scored = [];
    for (const idx of candidateIndices) {
      const row = this._rowCache[idx];
      const score = cosineSimilarity(queryTf, row.tf);
      if (score > 0) scored.push({ ...row, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** Remove all chunks for a specific document. */
  removeByDocId(docId) {
    this.db.run("DELETE FROM chunks WHERE doc_id = ?", [docId]);
    this._save();
    this._invalidateCache();
  }

  /** Get total chunk count. */
  count() {
    const row = this._get("SELECT COUNT(*) as cnt FROM chunks");
    return row ? row.cnt : 0;
  }

  /** List distinct documents in the store. */
  listDocs() {
    return this._all(
      "SELECT doc_id, title, category, COUNT(*) as chunks FROM chunks GROUP BY doc_id ORDER BY title"
    );
  }

  close() {
    this._save();
    this.db.close();
  }
}
