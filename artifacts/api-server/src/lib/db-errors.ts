function readText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return "";
}

function collectNestedErrors(root: unknown): unknown[] {
  const queue: unknown[] = [root];
  const seen = new Set<unknown>();
  const collected: unknown[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    collected.push(current);

    const asRecord = current as Record<string, unknown>;
    const nested = [asRecord.cause, asRecord.error, asRecord.originalError];
    for (const next of nested) {
      if (next) queue.push(next);
    }
  }

  return collected;
}

export function getDbErrorCode(error: unknown): string | null {
  for (const entry of collectNestedErrors(error)) {
    const code = (entry as Record<string, unknown>).code;
    if (typeof code === "string" && code.trim().length > 0) {
      return code;
    }
  }
  return null;
}

export function isDatabaseError(error: unknown): boolean {
  if (getDbErrorCode(error)) return true;
  const message = readText(error).toLowerCase();
  return message.includes("failed query:") || message.includes("database");
}

export function isSchemaDriftError(error: unknown): boolean {
  const code = getDbErrorCode(error);
  if (code && ["42P01", "42703", "42704", "42883", "42P07"].includes(code)) {
    return true;
  }

  const message = readText(error).toLowerCase();
  return (
    message.includes("failed query:") ||
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("column")
  );
}
