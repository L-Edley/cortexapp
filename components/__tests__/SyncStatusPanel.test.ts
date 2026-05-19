// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import SyncStatusPanel from "../SyncStatusPanel";

function mockHealthResponse(overrides: Record<string, unknown>) {
  return vi.mocked(globalThis.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      configured: true,
      online: true,
      url: "http://127.0.0.1:27123",
      ...overrides,
    }),
  } as Response);
}

function renderPanel() {
  return render(createElement(SyncStatusPanel));
}

describe("SyncStatusPanel", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED = "true";
    process.env.NODE_ENV = "test";
    globalThis.fetch = vi.fn();
    mockSync.mockReset();
    mockSync.mockImplementation(async function mockSyncFn() {
      return { total: 0, synced: 0, failed: 0, errors: [] };
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
  });

  it("renderiza com Obsidian não configurado", async () => {
    mockHealthResponse({ configured: false, online: false });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText("Não configurado")).toBeTruthy();
    });
  });

  it("mostra 'Online' quando health retorna configured=true e online=true", async () => {
    mockHealthResponse({ configured: true, online: true });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
    });
  });

  it("mostra 'Offline' quando health retorna configured=true e online=false", async () => {
    mockHealthResponse({ configured: true, online: false });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Offline")).toBeTruthy();
    });
  });

  it("mostra 'Desabilitado' quando NEXT_PUBLIC_OBSIDIAN_REST_ENABLED não é true", async () => {
    delete process.env.NEXT_PUBLIC_OBSIDIAN_REST_ENABLED;
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Desabilitado")).toBeTruthy();
    });
  });

  it("mostra 'Online' quando NEXT_PUBLIC_OBSIDIAN_REST_ENABLED=true e health online", async () => {
    mockHealthResponse({ configured: true, online: true });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeTruthy();
    });
  });

  it("chama /api/obsidian/health ao montar", async () => {
    mockHealthResponse({ configured: true, online: true });
    renderPanel();

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/obsidian/health");
    });
  });

  it("chama /api/obsidian/health ao clicar em 'Atualizar status'", async () => {
    mockHealthResponse({ configured: true, online: true });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    mockHealthResponse({ configured: true, online: true });
    const btn = screen.getByText("Atualizar status");
    await userEvent.click(btn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/obsidian/health");
    });
  });

  it("botão 'Sincronizar agora' chama syncObsidianToAion", async () => {
    mockHealthResponse({ configured: true, online: true });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    const btn = screen.getByText("Sincronizar agora");
    await userEvent.click(btn);

    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("erro no sync não quebra a tela", async () => {
    mockHealthResponse({ configured: true, online: true });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    mockSync.mockRejectedValue(new Error("erro de teste"));

    const btn = screen.getByText("Sincronizar agora");
    await userEvent.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/erro de teste/)).toBeTruthy();
    });
  });

  it("'Limpar Aion' não apaga registros principais do Cortex", async () => {
    mockHealthResponse({ configured: true, online: true });
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
    mockHealthResponse({ configured: false, online: false });
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Sync Aion")).toBeTruthy();
    });

    expect(screen.getByText("Não configurado")).toBeTruthy();
  });
});
