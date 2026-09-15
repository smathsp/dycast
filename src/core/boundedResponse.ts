/**
 * A response body that crosses its declared limit is cancelled immediately.
 * This keeps a malformed or unexpectedly large upstream response from growing
 * the renderer heap without bound.
 */
export class ResponseBodyLimitError extends Error {
  readonly code = 'RESPONSE_BODY_TOO_LARGE';

  constructor(
    readonly maximumBytes: number,
    readonly receivedBytes: number
  ) {
    super(`Response body exceeds ${maximumBytes} bytes`);
    this.name = 'ResponseBodyLimitError';
  }
}

function getAbortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException('The operation was aborted', 'AbortError');
}

async function cancelQuietly(
  stream: ReadableStream<Uint8Array> | null,
  reason: unknown
): Promise<void> {
  if (!stream || stream.locked) return;
  try {
    await stream.cancel(reason);
  } catch {
    // Cancellation is best effort; the original size/abort error is more useful.
  }
}

export async function readResponseBytesBounded(
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError('maximumBytes must be a positive safe integer');
  }

  if (signal?.aborted) {
    const error = getAbortError(signal);
    await cancelQuietly(response.body, error);
    throw error;
  }

  const declaredLengthHeader = response.headers.get('content-length');
  const declaredLength = declaredLengthHeader && /^\d+$/.test(declaredLengthHeader.trim())
    ? Number(declaredLengthHeader)
    : Number.NaN;
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    const error = new ResponseBodyLimitError(maximumBytes, declaredLength);
    await cancelQuietly(response.body, error);
    throw error;
  }

  const stream = response.body;
  if (!stream) return new Uint8Array(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    void reader.cancel(getAbortError(signal));
  };
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted || aborted) throw getAbortError(signal);
      const { done, value } = await reader.read();
      if (signal?.aborted || aborted) throw getAbortError(signal);
      if (done) break;
      if (!value?.byteLength) continue;

      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        const error = new ResponseBodyLimitError(maximumBytes, receivedBytes);
        try {
          await reader.cancel(error);
        } catch {}
        throw error;
      }
      // Fetch streams may reuse their backing storage; retain only this bounded copy.
      chunks.push(value.slice());
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {}
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {}
  }

  const result = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function readResponseTextBounded(
  response: Response,
  maximumBytes: number,
  signal?: AbortSignal
): Promise<string> {
  const bytes = await readResponseBytesBounded(response, maximumBytes, signal);
  return new TextDecoder('utf-8').decode(bytes);
}
