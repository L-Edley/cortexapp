export interface AionWebSource {
  title: string;
  url: string;
  snippet?: string;
  sourceName?: string;
  publishedAt?: string;
}

export interface WebSearchResult {
  query: string;
  sources: AionWebSource[];
  fetchedAt: string;
  provider: string;
}

export interface WebSearchProvider {
  readonly name: string;
  search(query: string, options?: { maxResults?: number }): Promise<WebSearchResult>;
}

// ─── Manual Mock Provider (for tests / no-API fallback) ───

class ManualMockProvider implements WebSearchProvider {
  readonly name = "manual_mock";

  async search(query: string, _options?: { maxResults?: number }): Promise<WebSearchResult> {
    const now = new Date().toISOString();
    return {
      query,
      sources: [
        {
          title: `Resultado simulado para: ${query.slice(0, 60)}`,
          url: "https://exemplo.com/resultado-simulado",
          snippet: `Este é um resultado simulado para a consulta "${query}". Em produção, substitua por um provedor real como Tavily, Brave ou Serper.`,
          sourceName: "Simulador",
          publishedAt: now,
        },
      ],
      fetchedAt: now,
      provider: "manual_mock",
    };
  }
}

// ─── Provider Factory ───

function createTavilyProvider(): WebSearchProvider {
  return {
    name: "tavily",
    async search(query: string, options?: { maxResults?: number }) {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        throw new Error("TAVILY_API_KEY não configurada");
      }

      const maxResults = options?.maxResults ?? 5;
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          search_depth: "advanced",
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const now = new Date().toISOString();

      const sources: AionWebSource[] = (data.results || []).map((r: any) => ({
        title: r.title || "Sem título",
        url: r.url || "",
        snippet: r.content || r.snippet || "",
        sourceName: "Tavily",
        publishedAt: r.published_date || now,
      }));

      return { query, sources, fetchedAt: now, provider: "tavily" };
    },
  };
}

function createBraveProvider(): WebSearchProvider {
  return {
    name: "brave",
    async search(query: string, options?: { maxResults?: number }) {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY;
      if (!apiKey) {
        throw new Error("BRAVE_SEARCH_API_KEY não configurada");
      }

      const maxResults = options?.maxResults ?? 5;
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const now = new Date().toISOString();
      const webResults = data.web?.results || [];

      const sources: AionWebSource[] = webResults.map((r: any) => ({
        title: r.title || "Sem título",
        url: r.url || "",
        snippet: r.description || "",
        sourceName: "Brave",
        publishedAt: r.age || now,
      }));

      return { query, sources, fetchedAt: now, provider: "brave" };
    },
  };
}

function createSerperProvider(): WebSearchProvider {
  return {
    name: "serper",
    async search(query: string, options?: { maxResults?: number }) {
      const apiKey = process.env.SERPER_API_KEY;
      if (!apiKey) {
        throw new Error("SERPER_API_KEY não configurada");
      }

      const maxResults = options?.maxResults ?? 5;
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({ q: query, num: maxResults }),
      });

      if (!response.ok) {
        throw new Error(`Serper API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const now = new Date().toISOString();
      const organic = data.organic || [];

      const sources: AionWebSource[] = organic.map((r: any) => ({
        title: r.title || "Sem título",
        url: r.link || "",
        snippet: r.snippet || "",
        sourceName: "Google (Serper)",
        publishedAt: r.date || now,
      }));

      return { query, sources, fetchedAt: now, provider: "serper" };
    },
  };
}

// ─── Registry / Factory ───

const providerRegistry: Record<string, () => WebSearchProvider> = {
  tavily: createTavilyProvider,
  brave: createBraveProvider,
  serper: createSerperProvider,
  manual_mock: () => new ManualMockProvider(),
};

export function getConfiguredProvider(): WebSearchProvider | null {
  const providerName = (process.env.WEB_SEARCH_PROVIDER || "none").toLowerCase();

  if (providerName === "none" || !providerName) {
    return null;
  }

  const factory = providerRegistry[providerName];
  if (!factory) {
    console.warn(`[WEB SEARCH] Provedor desconhecido: "${providerName}". Use um dos: ${Object.keys(providerRegistry).join(", ")}`);
    return null;
  }

  return factory();
}

export function getAvailableProviders(): string[] {
  return Object.keys(providerRegistry);
}
