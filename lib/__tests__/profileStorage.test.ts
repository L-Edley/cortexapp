import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/obsidian/client", () => ({
  readVaultFile: vi.fn(),
  writeVaultFile: vi.fn(),
}));

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(() => null),
  length: 0,
};

function sampleYaml(): string {
  return `version: 2
updatedAt: 2026-05-19T10:00:00.000Z
userName: Maria
currentGoal: Organizar finanças
lastFinancialReview: null
lastGoalReview: null
energyPattern:
  - period: manhã
    label: focado
behaviorTriggers: []
activeProjects: []
categorySpending: []
consistentHabits: []
abandonedHabits: []
`;
}

describe("migrateProfileFromObsidian", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migra do vault para localStorage com sucesso", async () => {
    const { migrateProfileFromObsidian } = await import("@/lib/aionProfile");
    const { readVaultFile } = await import("@/lib/obsidian/client");
    vi.mocked(readVaultFile).mockResolvedValue(sampleYaml());

    const result = await migrateProfileFromObsidian();

    expect(result).toBe(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile",
      expect.stringContaining("userName: Maria")
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile_migrated",
      "true"
    );
  });

  it("retorna false se vault estiver vazio", async () => {
    const { migrateProfileFromObsidian } = await import("@/lib/aionProfile");
    const { readVaultFile } = await import("@/lib/obsidian/client");
    vi.mocked(readVaultFile).mockResolvedValue(null);

    const result = await migrateProfileFromObsidian();

    expect(result).toBe(false);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("retorna false se vault falhar", async () => {
    const { migrateProfileFromObsidian } = await import("@/lib/aionProfile");
    const { readVaultFile } = await import("@/lib/obsidian/client");
    vi.mocked(readVaultFile).mockRejectedValue(new Error("network error"));

    const result = await migrateProfileFromObsidian();

    expect(result).toBe(false);
  });
});

describe("loadProfile com localStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("carrega de localStorage quando migrado", async () => {
    const { loadProfile } = await import("@/lib/aionProfile");
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === "aion_profile_migrated") return "true";
      if (key === "aion_profile") return sampleYaml();
      return null;
    });

    const profile = await loadProfile();

    expect(profile.userName).toBe("Maria");
    expect(profile.currentGoal).toBe("Organizar finanças");
    expect(profile.version).toBe(2);
  });

  it("retorna default se localStorage tem flag mas sem dados", async () => {
    const { loadProfile } = await import("@/lib/aionProfile");
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === "aion_profile_migrated") return "true";
      return null;
    });

    const profile = await loadProfile();

    expect(profile.version).toBe(1);
    expect(profile.userName).toBe("");
  });

  it("faz migração one-shot do vault quando não migrado", async () => {
    const { loadProfile } = await import("@/lib/aionProfile");
    const { readVaultFile } = await import("@/lib/obsidian/client");
    (readVaultFile as ReturnType<typeof vi.fn>).mockResolvedValue(sampleYaml());

    const profile = await loadProfile();

    expect(profile.userName).toBe("Maria");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile_migrated",
      "true"
    );
  });

  it("retorna default sem migration quando vault vazio e não migrado", async () => {
    const { loadProfile } = await import("@/lib/aionProfile");
    const { readVaultFile } = await import("@/lib/obsidian/client");
    (readVaultFile as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const profile = await loadProfile();

    expect(profile.version).toBe(1);
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});

describe("updateProfile com localStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("salva em localStorage e exporta para vault", async () => {
    const { updateProfile } = await import("@/lib/aionProfile");
    const { writeVaultFile } = await import("@/lib/obsidian/client");
    (writeVaultFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await updateProfile({ userName: "João", currentGoal: "Aprender" });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile",
      expect.stringContaining("userName: João")
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile_migrated",
      "true"
    );
    expect(writeVaultFile).toHaveBeenCalled();
  });

  it("não quebra se vault falhar", async () => {
    const { updateProfile } = await import("@/lib/aionProfile");
    const { writeVaultFile } = await import("@/lib/obsidian/client");
    (writeVaultFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("vault offline"));

    await expect(
      updateProfile({ userName: "João" })
    ).resolves.toBeUndefined();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile",
      expect.stringContaining("userName: João")
    );
  });
});

describe("analyzeAndUpdateProfile com localStorage", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", localStorageMock);
    localStorageMock.getItem.mockReset();
    localStorageMock.setItem.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("salva resultado em localStorage mesmo sem vault", async () => {
    const { analyzeAndUpdateProfile } = await import("@/lib/aionProfile");
    const { writeVaultFile } = await import("@/lib/obsidian/client");
    (writeVaultFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no vault"));

    const profile = await analyzeAndUpdateProfile();

    expect(profile.version).toBe(1);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile",
      expect.any(String)
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "aion_profile_migrated",
      "true"
    );
  });
});
