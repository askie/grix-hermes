export type JsonEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function printEnvelopeAndExit(envelope: JsonEnvelope<unknown>): never {
  if (envelope.ok) {
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exit(0);
  } else {
    process.stderr.write(`${JSON.stringify(envelope, null, 2)}\n`);
    process.exit(1);
  }
}
