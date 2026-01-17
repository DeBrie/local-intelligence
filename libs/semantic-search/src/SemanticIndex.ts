import {
  generateEmbedding,
  generateEmbeddingBatch,
} from './LocalIntelligenceSemanticSearch';
import type {
  IndexEntry,
  SearchResult,
  IndexStats,
  SearchOptions,
  AddEntryOptions,
} from './types';

export interface SemanticIndexOptions {
  databasePath: string;
  tableName?: string;
  embeddingDimensions?: number;
}

export class SemanticIndex {
  private db: any = null;
  private tableName: string;
  private embeddingDimensions: number;
  private databasePath: string;
  private isInitialized = false;

  constructor(options: SemanticIndexOptions) {
    this.databasePath = options.databasePath;
    this.tableName = options.tableName ?? 'semantic_index';
    this.embeddingDimensions = options.embeddingDimensions ?? 384;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const { open } = await import('@op-engineering/op-sqlite');

      this.db = open({
        name: this.databasePath,
      });

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id TEXT UNIQUE NOT NULL,
          text TEXT NOT NULL,
          embedding TEXT NOT NULL,
          metadata TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      // sqlite-vec virtual table uses rowid by default
      await this.db.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}_vec USING vec0(
          embedding float[${this.embeddingDimensions}]
        )
      `);

      this.isInitialized = true;
    } catch (error) {
      throw new Error(
        `Failed to initialize SemanticIndex: ${error instanceof Error ? error.message : String(error)}. ` +
          'Make sure @op-engineering/op-sqlite is installed with sqlite-vec extension.',
      );
    }
  }

  async add(
    id: string,
    text: string,
    options: AddEntryOptions = {},
  ): Promise<void> {
    this.ensureInitialized();

    if (options.skipDuplicates) {
      const existing = await this.db.execute(
        `SELECT doc_id FROM ${this.tableName} WHERE doc_id = ?`,
        [id],
      );
      const rows = existing.rows?._array || existing.rows || [];
      if (rows.length > 0) {
        return;
      }
    }

    const embeddingResult = await generateEmbedding(text);
    const embeddingJson = JSON.stringify(embeddingResult.embedding);
    const metadataJson = options.metadata
      ? JSON.stringify(options.metadata)
      : null;

    // Insert into main table and get rowid
    await this.db.execute(
      `INSERT OR REPLACE INTO ${this.tableName} (doc_id, text, embedding, metadata) VALUES (?, ?, ?, ?)`,
      [id, text, embeddingJson, metadataJson],
    );

    // Get the rowid for the vec table
    const rowResult = await this.db.execute(
      `SELECT rowid FROM ${this.tableName} WHERE doc_id = ?`,
      [id],
    );
    const rowid =
      rowResult.rows?._array?.[0]?.rowid ?? rowResult.rows?.[0]?.rowid;

    // Insert into vec table with matching rowid
    await this.db.execute(
      `INSERT OR REPLACE INTO ${this.tableName}_vec (rowid, embedding) VALUES (?, ?)`,
      [rowid, embeddingJson],
    );
  }

  async addBatch(
    entries: Array<{
      id: string;
      text: string;
      metadata?: Record<string, unknown>;
    }>,
    options: { skipDuplicates?: boolean } = {},
  ): Promise<{ added: number; skipped: number }> {
    this.ensureInitialized();

    const texts = entries.map((e) => e.text);
    const batchResult = await generateEmbeddingBatch(texts);

    let added = 0;
    let skipped = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const embedding = batchResult.embeddings[i].embedding;

      if (options.skipDuplicates) {
        const existing = await this.db.execute(
          `SELECT doc_id FROM ${this.tableName} WHERE doc_id = ?`,
          [entry.id],
        );
        const existingRows = existing.rows?._array || existing.rows || [];
        if (existingRows.length > 0) {
          skipped++;
          continue;
        }
      }

      const embeddingJson = JSON.stringify(embedding);
      const metadataJson = entry.metadata
        ? JSON.stringify(entry.metadata)
        : null;

      // Insert into main table
      await this.db.execute(
        `INSERT OR REPLACE INTO ${this.tableName} (doc_id, text, embedding, metadata) VALUES (?, ?, ?, ?)`,
        [entry.id, entry.text, embeddingJson, metadataJson],
      );

      // Get the rowid for the vec table
      const rowResult = await this.db.execute(
        `SELECT rowid FROM ${this.tableName} WHERE doc_id = ?`,
        [entry.id],
      );
      const rowid =
        rowResult.rows?._array?.[0]?.rowid ?? rowResult.rows?.[0]?.rowid;

      // Insert into vec table with matching rowid
      await this.db.execute(
        `INSERT OR REPLACE INTO ${this.tableName}_vec (rowid, embedding) VALUES (?, ?)`,
        [rowid, embeddingJson],
      );

      added++;
    }

    return { added, skipped };
  }

  async search(
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    this.ensureInitialized();

    const { limit = 10, minSimilarity = 0.0, includeMetadata = true } = options;

    const queryEmbedding = await generateEmbedding(query);

    console.log('Query embedding length:', queryEmbedding.embedding.length);

    // Query sqlite-vec for nearest neighbors
    const vecResults = await this.db.execute(
      `SELECT rowid, distance 
       FROM ${this.tableName}_vec 
       WHERE embedding MATCH ?
       ORDER BY distance
       LIMIT ?`,
      [JSON.stringify(queryEmbedding.embedding), limit * 2],
    );

    console.log('Vec results:', JSON.stringify(vecResults));

    const results: SearchResult[] = [];

    const vecRows = vecResults.rows?._array || vecResults.rows || [];
    console.log('Vec rows count:', vecRows.length);

    for (const vecRow of vecRows) {
      const similarity = 1 - vecRow.distance;

      if (similarity < minSimilarity) {
        continue;
      }

      // Look up the document by rowid
      const docResult = await this.db.execute(
        `SELECT doc_id, text, metadata FROM ${this.tableName} WHERE rowid = ?`,
        [vecRow.rowid],
      );

      const docRows = docResult.rows?._array || docResult.rows || [];
      if (docRows.length > 0) {
        const doc = docRows[0];
        results.push({
          id: doc.doc_id,
          text: doc.text,
          similarity,
          metadata:
            includeMetadata && doc.metadata
              ? JSON.parse(doc.metadata)
              : undefined,
        });
      }

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  async remove(id: string): Promise<boolean> {
    this.ensureInitialized();

    // Get rowid first for vec table deletion
    const rowResult = await this.db.execute(
      `SELECT rowid FROM ${this.tableName} WHERE doc_id = ?`,
      [id],
    );
    const rowid =
      rowResult.rows?._array?.[0]?.rowid ?? rowResult.rows?.[0]?.rowid;

    const result = await this.db.execute(
      `DELETE FROM ${this.tableName} WHERE doc_id = ?`,
      [id],
    );

    if (rowid) {
      await this.db.execute(
        `DELETE FROM ${this.tableName}_vec WHERE rowid = ?`,
        [rowid],
      );
    }

    return result.rowsAffected > 0;
  }

  async clear(): Promise<void> {
    this.ensureInitialized();

    await this.db.execute(`DELETE FROM ${this.tableName}`);
    await this.db.execute(`DELETE FROM ${this.tableName}_vec`);
  }

  async getEntry(id: string): Promise<IndexEntry | null> {
    this.ensureInitialized();

    const result = await this.db.execute(
      `SELECT doc_id, text, metadata, created_at FROM ${this.tableName} WHERE doc_id = ?`,
      [id],
    );

    const rows = result.rows?._array || result.rows || [];
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.doc_id,
      text: row.text,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    };
  }

  async getStats(): Promise<IndexStats> {
    this.ensureInitialized();

    const countResult = await this.db.execute(
      `SELECT COUNT(*) as count FROM ${this.tableName}`,
    );

    const rows = countResult.rows?._array || countResult.rows || [];
    const count = rows[0]?.count ?? 0;

    return {
      totalEntries: count,
      databaseSizeBytes: 0,
      embeddingDimensions: this.embeddingDimensions,
      tableName: this.tableName,
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        'SemanticIndex not initialized. Call initialize() first.',
      );
    }
  }
}
