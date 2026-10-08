// The project name with its level name in parentheses, e.g. "Pariveda (Launch)".
// Callers pass a null levelName (no level, or a client viewer) to get the bare name.
export function levelSuffix(name: string, levelName: string | null): string {
  return levelName ? `${name} (${levelName})` : name;
}
