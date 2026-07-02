// Convert an ALL CAPS or mixed-case string to Title Case.
// Used to normalize vehicle make/model values that come from the API in ALL CAPS.
export function toTitleCase(s: string): string {
  if (!s) return s
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
