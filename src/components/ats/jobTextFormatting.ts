type TextEdit = { value: string; start: number; end: number };
const marker = /^(\s*)(?:[•*-]|\d+[.)])\s+/;

/** Keep job copy plain text so the careers feed and existing consumers need no new contract. */
export function formatJobList(value: string, start: number, end: number, ordered: boolean): TextEdit {
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", last);
  const to = nextBreak < 0 ? value.length : nextBreak;
  const lines = value.slice(from, to).split("\n");
  const active = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[•*-]\s+/;
  const remove = lines.every((line) => active.test(line));
  const replacement = lines.map((line, index) => {
    const plain = line.replace(marker, "$1");
    if (remove) return plain;
    const indent = plain.match(/^\s*/)?.[0] ?? "";
    return `${indent}${ordered ? `${index + 1}.` : "•"} ${plain.slice(indent.length)}`;
  }).join("\n");
  return { value: value.slice(0, from) + replacement + value.slice(to), start: from, end: from + replacement.length };
}

export function continueJobList(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const line = value.slice(from, start);
  const match = line.match(/^(\s*)([•*-]|(\d+)[.)])\s+(.*)$/);
  if (!match) return null;
  if (!match[4].trim()) {
    return { value: value.slice(0, from) + match[1] + value.slice(start), start: from + match[1].length, end: from + match[1].length };
  }
  const insertion = `\n${match[1]}${match[3] ? `${Number(match[3]) + 1}.` : "•"} `;
  const caret = start + insertion.length;
  return { value: value.slice(0, start) + insertion + value.slice(end), start: caret, end: caret };
}