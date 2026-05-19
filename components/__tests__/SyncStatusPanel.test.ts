// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockSync, mockClearAll, mockGetAll } = vi.hoisted(() => ({
  mockSync: vi.fn(async function mockSyncFn() {
    return { total: 0, synced: 0, failed: 0, errors: [] };
  }),
  mockClearAll: vi.fn(async function mockClearAllFn() {}),
  mockGetAll: vi.fn(async function mockGetAllFn() {
    return [];
  }),
}));

vi.mock("@/lib/storage", () => ({
  getRecords: vi.fn(() => []),
}));

function MockAdapter() {
  return {
    getAll: mockGetAll,
    clearAll: mockClearAll,
    upsert: vi.fn(),
    findById: vi.fn(),
    markSynced: vi.fn(),
  };
}
vi.mock("@/lib/aion/sync/localStorageAdapter", () => ({
  LocalStorageAionAdapter: MockAdapter,
}));

vi.mock("@/lib/aion/sync/sync", () => ({
  syncObsidianToAion: mockSync,
}));

vi.mock("@/lib/obsidian/client", () => ({
  checkObsidianConnection: vi.fn(async () => false),
  getObsidianConfig: vi.fn(() => ({
    enabled: false,
    baseUrl: "http://127.0.0.1:27123",
  })),
}));

import SyncStatusPanel from "../SyncStatusPanel";

function renderPanel() {
  return render(createElement(SyncStatusPanel));
}

describe("SyncStatusPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { checkObsidianConnection, getObsidianConfig } = await import(
      "@/lib/obsidian/client"
    );
    vi.mocked(checkObsidianConnection).mockReset();
    vi.mocked(checkObsidianConnection).mockImplementation(async () => false);
    vi.mocked(getObsidianConfig).mockReset();
    vi.mocked(getObsidianConfig).mockImplementation(() => ({
      enabled: false,
      baseUrl: "http://127.0.0.1:27123",
    }));
    mockSync.mockReset();
    mockSync.mockImplementation(async function mockSyncFn() {
      return { total: 0, synced: 0, failed: 0, errors: [] };
    });
  });

  it("renderiza com Obsidian não configurado", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    expect(screen.getByText("Não configurado")).toBeTruthy();
  });

  it("mostra 'Online' quando health retorna configured=true e online=true", async () => {
    const { checkObsidianConnection, getObsidianConfig } = await import(
      "@/lib/obsidian/client"
    );
    vi.mocked(checkObsidianConnection).mockResolvedValue(true);
    vi.mocked(getObsidianConfig).mockReturnValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:27123",
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
    });
  });

  it("mostra 'Offline' quando health retorna configured=true e online=false", async () => {
    const { checkObsidianConnection, getObsidianConfig } = await import(
      "@/lib/obsidian/client"
    );
    vi.mocked(checkObsidianConnection).mockResolvedValue(false);
    vi.mocked(getObsidianConfig).mockReturnValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:27123",
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeTruthy();
    });
  });

  it("botão 'Sincronizar agora' chama syncObsidianToAion", async () => {
    const { checkObsidianConnection, getObsidianConfig } = await import(
      "@/lib/obsidian/client"
    );
    vi.mocked(checkObsidianConnection).mockResolvedValue(true);
    vi.mocked(getObsidianConfig).mockReturnValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:27123",
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    const btn = screen.getByText("Sincronizar agora");
    await userEvent.click(btn);

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("erro no sync não quebra a tela", async () => {
    const { checkObsidianConnection, getObsidianConfig } = await import(
      "@/lib/obsidian/client"
    );
    vi.mocked(checkObsidianConnection).mockResolvedValue(true);
    vi.mocked(getObsidianConfig).mockReturnValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:27123",
    });
    mockSync.mockRejectedValue(new Error("erro de teste"));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    const btn = screen.getByText("Sincronizar agora");
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/erro de teste/)).toBeTruthy();
    });
  });

  it("'Limpar Aion' não apaga registros principais do Cortex", async () => {
    const { checkObsidianConnection, getObsidianConfig } = await import(
      "@/lib/obsidian/client"
    );
    vi.mocked(checkObsidianConnection).mockResolvedValue(true);
    vi.mocked(getObsidianConfig).mockReturnValue({
      enabled: true,
      baseUrl: "http://127.0.0.1:27123",
    });
    window.confirm = vi.fn(() => true);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    const btn = screen.getByText("Limpar Aion");
    await userEvent.click(btn);

    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it("funciona offline (sem Obsidian configurado)", async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    expect(screen.getByText("Não configurado")).toBeTruthy();

    const btn = screen.getByText("Sincronizar agora");
    await userEvent.click(btn);

    expect(mockSync).toHaveBeenCalledTimes(1);
  });
});
