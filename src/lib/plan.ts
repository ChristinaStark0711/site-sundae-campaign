import { marked } from "marked";

// Typographic polish on the rendered plan HTML (the markdown itself is unchanged):
// - arrow glyphs are not in the Lato/Merriweather web subsets, so they render as a line icon that reads as "to";
// - AP times ("7:30-7:35 p.m.", "10:30 p.m. +") and short dates ("Oct. 8") never split across lines;
// - short code chips (SHAI agent names such as /ghl-voice-agent-builder) stay on one line;
// - tables scroll inside their own box (with an edge shadow cue) instead of widening the page. The box is a named,
//   focusable region so the keyboard can scroll it too; its name is the heading the table sits under ("Run of show table"),
//   numbered if a heading has more than one, so no two regions on a page share a name.
const GLYPHS: Record<string, [string, string]> = { "→": ["arrow", "to"], "←": ["arrow-left", "from"], "↔": ["arrow-lr", "back and forth"] };
// The text rules run only on the text between tags, never inside a tag or an attribute (a title or alt stays untouched).
const polishText = (t: string) => t
  .replace(/[→←↔]/g, (g) => `<span class="ico ico-${GLYPHS[g][0]}" role="img" aria-label="${GLYPHS[g][1]}"></span>`)
  .replace(/\b\d{1,2}(?::\d{2})?(?:-\d{1,2}(?::\d{2})?)? [ap]\.m\.(?: \+)?/g, (m) => `<span class="nw">${m}</span>`)
  .replace(/\b(Jan|Feb|Aug|Sept|Oct|Nov|Dec)\. (\d{1,2})\b/g, "$1.&nbsp;$2");
// A heading's text for an attribute: arrow icons read as their label, other tags and the section number ("5. ") dropped,
// entities left escaped.
const headingText = (h: string) => h.replace(/<span class="ico[^"]*" role="img" aria-label="([^"]*)"><\/span>/g, " $1 ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().replace(/^\d+(\.\d+)*\.? /, "");
function wrapTables(html: string) {
  let heading = "", n = 0;
  const used = new Map<string, number>();
  return html.replace(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>|<table>/g, (m, h?: string) => {
    if (h !== undefined) { heading = headingText(h); return m; }
    const base = heading ? `${heading} table` : `Table ${++n}`;
    const k = (used.get(base) ?? 0) + 1;
    used.set(base, k);
    return `<div class="scroll-x table-scroll" tabindex="0" role="region" aria-label="${k > 1 ? `${base} ${k}` : base}"><table>`;
  }).replace(/<\/table>/g, "</table></div>");
}
function polish(html: string) {
  return wrapTables(html
    .split(/(<[^>]*>)/)
    .map((part, i) => (i % 2 ? part : polishText(part)))
    .join("")
    .replace(/(?<!<pre>)<code>([^<\s]{1,32})<\/code>/g, '<code class="nw">$1</code>'));
}

// A line that opens with a bold label ("**When:** …") starts on its own line instead of running on from the previous one
// (lines that already end in a backslash hard break are left alone).
// A wrapped continuation line that opens with "+ " joins the line above instead of rendering as a stray nested bullet.
export function renderPlan(md: string) {
  const body = md.replace(/^# .*\n/, "").replace(/([^\n\\])\n(\*\*[^*\n]+:\*\*)/g, "$1  \n$2").replace(/\n[ \t]+\+ /g, " + ");
  return polish(marked.parse(body, { gfm: true }) as string);
}
