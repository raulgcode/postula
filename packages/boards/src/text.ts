const named: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
};

/** `&lt;p&gt;` → `<p>`, `&#39;` → `'`: Greenhouse sends its HTML escaped once. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const value =
        code[1] === "x" || code[1] === "X"
          ? Number.parseInt(code.slice(2), 16)
          : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000
        ? String.fromCodePoint(value)
        : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

/**
 * A posting's HTML as plain text a person (and the scorer) can read: paragraphs and list items
 * on their own lines, no tags, no scripts or styles. Never rendered as HTML anywhere.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(withBreaks)
    .replace(/ /g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
