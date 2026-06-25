import { search, SafeSearchType } from "duck-duck-scrape";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

const turndownService = new TurndownService();

export async function duckDuckGoSearch(query: string, limit: number = 5) {
  try {
    const results = await search(query, {
      safeSearch: SafeSearchType.MODERATE,
    });
    return results.results.slice(0, limit).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
    }));
  } catch (err) {
    return { error: String(err) };
  }
}

export async function fetchAndParsePage(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, nav, etc.
    $("script, style, noscript, nav, header, footer, iframe, svg").remove();
    
    // Convert what's left to markdown
    const content = turndownService.turndown($.html());
    return content;
  } catch (err) {
    return { error: String(err) };
  }
}
