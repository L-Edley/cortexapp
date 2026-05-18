import * as fs from "fs";
import * as path from "path";
import type {
  AionBrainItem,
  BrainMemoryEntry,
  SearchCacheEntry,
  ConversationEntry,
} from "./types";

const BRAIN_PATH = path.join(process.cwd(), ".brain");

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureDir(): void {
  if (!fs.existsSync(BRAIN_PATH)) {
    fs.mkdirSync(BRAIN_PATH, { recursive: true });
  }
}

class Collection<T extends { id: string }> {
  private filePath: string;
  private data: T[] | null = null;

  constructor(name: string) {
    this.filePath = path.join(BRAIN_PATH, `${name}.json`);
  }

  private load(): T[] {
    if (this.data) return this.data;
    ensureDir();
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.data = JSON.parse(raw) as T[];
      } else {
        this.data = [];
      }
    } catch {
      this.data = [];
    }
    return this.data!;
  }

  private save(): void {
    ensureDir();
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  async add(item: T): Promise<void> {
    this.load().push(item);
    this.save();
  }

  async put(item: T): Promise<void> {
    const data = this.load();
    const idx = data.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      data[idx] = item;
    } else {
      data.push(item);
    }
    this.save();
  }

  async get(id: string): Promise<T | undefined> {
    return this.load().find((i) => i.id === id);
  }

  async delete(id: string): Promise<void> {
    const data = this.load();
    this.data = data.filter((i) => i.id !== id);
    this.save();
  }

  async toArray(): Promise<T[]> {
    return [...this.load()];
  }

  async filter(fn: (item: T) => boolean): Promise<T[]> {
    return this.load().filter(fn);
  }

  async count(): Promise<number> {
    return this.load().length;
  }
}

export class BrainStore {
  records: Collection<AionBrainItem>;
  memories: Collection<BrainMemoryEntry>;
  knowledge: Collection<AionBrainItem>;
  searchCache: Collection<SearchCacheEntry>;
  conversations: Collection<ConversationEntry>;
  settings: Collection<{ id: string; key: string; value: unknown }>;

  constructor() {
    this.records = new Collection<AionBrainItem>("records");
    this.memories = new Collection<BrainMemoryEntry>("memories");
    this.knowledge = new Collection<AionBrainItem>("knowledge");
    this.searchCache = new Collection<SearchCacheEntry>("searchCache");
    this.conversations = new Collection<ConversationEntry>("conversations");
    this.settings = new Collection<{ id: string; key: string; value: unknown }>("settings");
  }
}

let _instance: BrainStore | null = null;

export function getBrainStore(): BrainStore {
  if (!_instance) {
    _instance = new BrainStore();
  }
  return _instance;
}
