function safeString(value) {
  return String(value ?? '').trim();
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function isRetryableNetworkMessage(message) {
  const normalized = safeString(message).toLowerCase();

  if (!normalized) {
    return false;
  }

  return [
    'econnreset',
    'socket hang up',
    'etimedout',
    'eai_again',
    'ehostunreach',
    'enotfound',
    'read econnreset',
    'write econnreset',
  ].some(function (keyword) {
    return normalized.includes(keyword);
  });
}

function isRetryableTrackingResult(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }

  if (safeString(result.status) !== '오류') {
    return false;
  }

  return isRetryableNetworkMessage(result.message);
}

function getRetryDelayMs(attempt, baseDelayMs) {
  const exponential = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 120);

  return exponential + jitter;
}

async function runWithRetry(task, options) {
  const maxAttempts = Number(options?.maxAttempts ?? 3);
  const baseDelayMs = Number(options?.baseDelayMs ?? 300);
  const shouldRetryResult =
    typeof options?.shouldRetryResult === 'function'
      ? options.shouldRetryResult
      : function () {
          return false;
        };

  let lastResult;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await task(attempt);
    lastResult = result;

    if (!shouldRetryResult(result) || attempt === maxAttempts) {
      return result;
    }

    const delayMs = getRetryDelayMs(attempt, baseDelayMs);
    await sleep(delayMs);
  }

  return lastResult;
}

async function mapWithConcurrency(items, worker, concurrency) {
  const safeItems = Array.isArray(items) ? items : [];
  const size = safeItems.length;

  if (size === 0) {
    return [];
  }

  const limit = Math.max(1, Number(concurrency) || 1);
  const results = new Array(size);
  let cursor = 0;

  async function consume() {
    while (true) {
      const current = cursor;
      cursor += 1;

      if (current >= size) {
        return;
      }

      results[current] = await worker(safeItems[current], current);
    }
  }

  const workers = Array.from({length: Math.min(limit, size)}, function () {
    return consume();
  });

  await Promise.all(workers);

  return results;
}

module.exports = {
  isRetryableTrackingResult: isRetryableTrackingResult,
  mapWithConcurrency: mapWithConcurrency,
  runWithRetry: runWithRetry,
};
