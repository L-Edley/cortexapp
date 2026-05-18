import type { AionSource } from "@/lib/aion/types";

export type SearchResult = {
  results: AionSource[];
  rawSnippet: string;
};

export async function searchWeb(query: string): Promise<SearchResult> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (apiKey && engineId) {
    return searchGoogleCustom(query, apiKey, engineId);
  }

  return searchFallback(query);
}

async function searchGoogleCustom(
  query: string,
  apiKey: string,
  engineId: string
): Promise<SearchResult> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", engineId);
  url.searchParams.set("q", query);
  url.searchParams.set("lr", "lang_pt");
  url.searchParams.set("num", "5");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Search API error: ${res.status}`);
  }

  const data = await res.json();

  const results: AionSource[] = (data.items || []).map(
    (item: { title?: string; link?: string }) => ({
      title: item.title || "Sem título",
      url: item.link || "#",
    })
  );

  const rawSnippet =
    results.length > 0
      ? results.map((r, i) => `${i + 1}. ${r.title} - ${r.url}`).join("\n")
      : "Nenhum resultado encontrado.";

  return { results, rawSnippet };
}

async function searchFallback(query: string): Promise<SearchResult> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const html = await res.text();

    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const results: AionSource[] = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
      const url = match[1];
      const title = match[2].replace(/<[^>]*>/g, "").trim();
      if (title && url && !url.startsWith("/")) {
        results.push({ title, url });
      }
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
    }

    const rawSnippet =
      results.length > 0
        ? results
            .map((r, i) => `${i + 1}. ${r.title} - ${r.url}`)
            .join("\n")
        : "Nenhum resultado encontrado na busca alternativa.";

    return { results, rawSnippet };
  } catch {
    return {
      results: [],
      rawSnippet: "Não foi possível realizar a pesquisa no momento.",
    };
  }
}
