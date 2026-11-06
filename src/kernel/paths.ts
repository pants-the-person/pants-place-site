/** Helpers for C:\ paths used by Explorer, Wine and the filesystem. */

export function normalizeWindowsPath(input: string): string {
  let path = String(input || '').replace(/\//g, '\\').replace(/\\+/g, '\\').trim();
  if (!/^[a-z]:/i.test(path)) path = `c:\\${path.replace(/^\\+/, '')}`;
  const parts = path.split('\\');
  const drive = `${parts.shift()?.slice(0, 2).toLowerCase()}\\`;
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.length ? `${drive}${out.join('\\')}` : drive;
}

export function splitWindowsPath(input: string): string[] {
  const clean = normalizeWindowsPath(input);
  const drive = clean.slice(0, 2).toUpperCase();
  const parts = clean.slice(3).split('\\').filter(Boolean);
  return [drive, ...parts];
}

export function joinWindowsPath(parts: string[], drive = 'C'): string {
  const clean = parts.map((part) => String(part).replace(/^\\+|\\+$/g, '')).filter(Boolean);
  const explicit = clean[0] && /^[a-z]:$/i.test(clean[0]) ? clean.shift()!.toUpperCase() : null;
  const letter = (explicit ?? `${drive.toUpperCase()}:`).slice(0, 2);
  return clean.length ? `${letter}\\${clean.join('\\')}` : `${letter}\\`;
}

export function basenameWindowsPath(input: string): string {
  const clean = normalizeWindowsPath(input);
  return clean === 'c:\\' ? '' : clean.slice(clean.lastIndexOf('\\') + 1);
}

/** Quote a single Windows path for a guest command line. */
export function quoteWindowsArg(path: string): string {
  const value = String(path || '');
  if (!value) return '""';
  if (/^".*"$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}
