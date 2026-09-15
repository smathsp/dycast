import pako from 'pako';

// Douyin frames are normally far smaller than these ceilings. The separate
// compressed/output limits also prevent a small gzip bomb from expanding into
// an unbounded renderer allocation.
export const MAX_WEBSOCKET_FRAME_BYTES = 4 * 1024 * 1024;
export const MAX_COMPRESSED_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_DECODED_PAYLOAD_BYTES = 8 * 1024 * 1024;

export type FramePayloadLimitKind = 'websocket-frame' | 'compressed-payload' | 'decoded-payload';

export class FramePayloadLimitError extends Error {
  readonly code = 'FRAME_PAYLOAD_TOO_LARGE';

  constructor(
    readonly kind: FramePayloadLimitKind,
    readonly maximumBytes: number,
    readonly receivedBytes: number
  ) {
    super(`${kind} exceeds ${maximumBytes} bytes`);
    this.name = 'FramePayloadLimitError';
  }
}

export function assertFramePayloadSize(
  payload: { byteLength: number },
  maximumBytes: number,
  kind: FramePayloadLimitKind
): void {
  if (payload.byteLength > maximumBytes) {
    throw new FramePayloadLimitError(kind, maximumBytes, payload.byteLength);
  }
}

export function isFramePayloadLimitError(error: unknown): error is FramePayloadLimitError {
  return error instanceof FramePayloadLimitError || (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'FRAME_PAYLOAD_TOO_LARGE'
  );
}

export function inflateGzipBounded(
  payload: Uint8Array,
  maximumBytes: number = MAX_DECODED_PAYLOAD_BYTES
): Uint8Array {
  assertFramePayloadSize(payload, MAX_COMPRESSED_PAYLOAD_BYTES, 'compressed-payload');

  const inflator = new pako.Inflate({ chunkSize: 64 * 1024 });
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let limitError: FramePayloadLimitError | undefined;

  inflator.onData = chunk => {
    const view = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    receivedBytes += view.byteLength;
    if (receivedBytes > maximumBytes) {
      limitError = new FramePayloadLimitError('decoded-payload', maximumBytes, receivedBytes);
      throw limitError;
    }
    chunks.push(view.slice());
  };

  try {
    const complete = inflator.push(payload, true);
    if (!complete || inflator.err) {
      throw new Error(inflator.msg || 'Unable to decompress WebSocket payload');
    }
  } catch (error) {
    if (limitError) throw limitError;
    throw error;
  }

  const result = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
