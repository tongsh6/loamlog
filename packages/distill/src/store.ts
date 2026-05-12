import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssetStore, VerifiedAsset, Logger } from "@loamlog/core";

interface StateHistoryEntry {
  timestamp: string;
  workshop: string;
  action: string;
  prev_status?: string;
}

interface StoredAsset extends VerifiedAsset {
  workshop?: string;
  state_history?: StateHistoryEntry[];
}

/**
 * File-based implementation of the Refinery Asset Store.
 * Assets are stored as individual JSON files in {dumpDir}/distill/{repo}/assets/{id}.json.
 */
export class LocalAssetStore implements AssetStore {
  private baseDir: string;

  constructor(
    dumpDir: string,
    public repoPath: string,
    _logger: Logger
  ) {
    const safeRepo = (repoPath || "_global").replace(/[^a-zA-Z0-9._-]/g, "_");
    this.baseDir = path.join(dumpDir, "distill", safeRepo, "assets");
  }

  private async ensureDir() {
    await mkdir(this.baseDir, { recursive: true });
  }

  async get(assetId: string): Promise<VerifiedAsset | undefined> {
    const filePath = path.join(this.baseDir, `${assetId}.json`);
    try {
      const content = await readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch {
      return undefined;
    }
  }

  async update(assetId: string, update: Partial<VerifiedAsset>): Promise<void> {
    await this.ensureDir();
    const filePath = path.join(this.baseDir, `${assetId}.json`);
    
    let current = (await this.get(assetId)) as StoredAsset | undefined;
    
    if (current) {
      // Logic for merging updates and recording state history
      const action = update.verification?.status || "updated";
      const workshop = (update as Partial<StoredAsset>).workshop || "refinery";
      
      const historyEntry = {
        timestamp: new Date().toISOString(),
        workshop,
        action,
        prev_status: current.verification?.status
      };

      current = {
        ...current,
        ...update,
        verification: update.verification ?? current.verification,
        state_history: [...(current.state_history || []), historyEntry]
      };
    } else {
      // New asset ingestion
      current = {
        ...update,
        id: assetId,
        state_history: [{
          timestamp: new Date().toISOString(),
          workshop: "ingestion",
          action: "created"
        }]
      } as StoredAsset;
    }

    await writeFile(filePath, JSON.stringify(current, null, 2), "utf8");
  }

  async list(filter?: { status?: string[] }): Promise<VerifiedAsset[]> {
    await this.ensureDir();
    try {
      const files = await readdir(this.baseDir);
      const assets: VerifiedAsset[] = [];
      
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const asset = await this.get(path.basename(file, ".json"));
        if (asset) {
          if (!filter?.status || filter.status.includes(asset.verification?.status ?? "")) {
            assets.push(asset);
          }
        }
      }
      return assets;
    } catch {
      return [];
    }
  }
}
