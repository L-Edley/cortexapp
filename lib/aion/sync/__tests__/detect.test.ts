import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Re-import after mocking fetch
import { detectUnsyncedNotes } from "../detect";

describe("detectUnsyncedNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna [] se não há arquivos no vault", async () => {
    const records = await detectUnsyncedNotes();
    expect(records).toEqual([]);
  });

  it("retorna [] se Obsidian estiver offline (fetch rejeita)", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const records = await detectUnsyncedNotes();
    expect(records).toEqual([]);
  });
});
