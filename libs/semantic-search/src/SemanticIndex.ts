import {
  generateEmbedding,
  generateEmbeddingBatch,
} from './DebrieSemanticSearch';
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
          id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          embedding BLOB NOT NULL,
          metadata TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        )
      `);

      await this.db.execute(`
        CREATE VIRTUAL TABLE IF NOT EXISTS ${this.tableName}_vec USING vec0(
          id TEXT PRIMARY KEY,
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
        `SELECT id FROM ${this.tableName} WHERE id = ?`,
        [id],
      );
      if (existing.rows.length > 0) {
        return;
      }
    }

    const embeddingResult = await generateEmbedding(text);
    // Store embedding as JSON string for the main table
    const embeddingJson = JSON.stringify(embeddingResult.embedding);
    const metadataJson = options.metadata
      ? JSON.stringify(options.metadata)
      : null;

    await this.db.execute(
      `INSERT OR REPLACE INTO ${this.tableName} (id, text, embedding, metadata) VALUES (?, ?, ?, ?)`,
      [id, text, embeddingJson, metadataJson],
    );

    // For sqlite-vec, pass the embedding array as a JSON string
    await this.db.execute(
      `INSERT OR REPLACE INTO ${this.tableName}_vec (id, embedding) VALUES (?, ?)`,
      [id, JSON.stringify(embeddingResult.embedding)],
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
          `SELECT id FROM ${this.tableName} WHERE id = ?`,
          [entry.id],
        );
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }
      }

      // Store embedding as JSON string for the main table
      const embeddingJson = JSON.stringify(embedding);
      const metadataJson = entry.metadata
        ? JSON.stringify(entry.metadata)
        : null;

      await this.db.execute(
        `INSERT OR REPLACE INTO ${this.tableName} (id, text, embedding, metadata) VALUES (?, ?, ?, ?)`,
        [entry.id, entry.text, embeddingJson, metadataJson],
      );

      // For sqlite-vec, pass the embedding array as a JSON string
      await this.db.execute(
        `INSERT OR REPLACE INTO ${this.tableName}_vec (id, embedding) VALUES (?, ?)`,
        [entry.id, JSON.stringify(embedding)],
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

    // Pass embedding as JSON string for sqlite-vec
    const vecResults = await this.db.execute(
      `SELECT id, distance FROM ${this.tableName}_vec 
       WHERE embedding MATCH ? 
       ORDER BY distance 
       LIMIT ?`,
      [JSON.stringify(queryEmbedding.embedding), limit * 2],
    );

    const results: SearchResult[] = [];

    for (const row of vecResults.rows) {
      const similarity = 1 - row.distance;

      if (similarity < minSimilarity) {
        continue;
      }

      const entryResult = await this.db.execute(
        `SELECT text, metadata FROM ${this.tableName} WHERE id = ?`,
        [row.id],
      );

      if (entryResult.rows.length > 0) {
        const entry = entryResult.rows[0];
        results.push({
          id: row.id,
          text: entry.text,
          similarity,
          metadata:
            includeMetadata && entry.metadata
              ? JSON.parse(entry.metadata)
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

    const result = await this.db.execute(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [id],
    );

    await this.db.execute(`DELETE FROM ${this.tableName}_vec WHERE id = ?`, [
      id,
    ]);

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
      `SELECT id, text, metadata, created_at FROM ${this.tableName} WHERE id = ?`,
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
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

    return {
      totalEntries: countResult.rows[0].count,
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
