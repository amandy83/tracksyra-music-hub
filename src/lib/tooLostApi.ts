import type { TooLostConnectionStatus, TooLostReleaseStatusSnapshot, TooLostSyncResult } from "@/lib/tooLostHub";

const TOO_LOST_API_ROOT = "/api/distribution/too-lost";

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;
  if (!response.ok) {
    const message = typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.message === "string"
        ? payload.message
        : response.statusText;
    throw new Error(message || "Too Lost request failed");
  }
  return payload as T;
}

export async function fetchTooLostStatus(): Promise<TooLostConnectionStatus> {
  const response = await requestJson<{ status: TooLostConnectionStatus }>(`${TOO_LOST_API_ROOT}/status`);
  return response.status;
}

export async function buildTooLostAuthorizationUrl(returnToPath = "/dashboard"): Promise<{ url: string; state: string }> {
  const response = await requestJson<{ url: string; state: string }>(`${TOO_LOST_API_ROOT}/oauth/authorize?returnTo=${encodeURIComponent(returnToPath)}`);
  return { url: response.url, state: response.state };
}

export async function disconnectTooLost(reason = "Disconnected by operator"): Promise<TooLostConnectionStatus> {
  const response = await requestJson<{ status: TooLostConnectionStatus }>(`${TOO_LOST_API_ROOT}/disconnect`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return response.status;
}

export async function syncTooLostNow(userId: string, payload?: unknown): Promise<TooLostSyncResult> {
  return requestJson<TooLostSyncResult>(`${TOO_LOST_API_ROOT}/sync-now`, {
    method: "POST",
    body: JSON.stringify({ userId, payload }),
  });
}

export async function submitTooLostRelease(releaseId: string): Promise<{ release: TooLostReleaseStatusSnapshot; request: unknown; response: unknown; externalReleaseId: string | null }> {
  const response = await requestJson<{ release: TooLostReleaseStatusSnapshot; request: unknown; response: unknown; externalReleaseId: string | null }>(`${TOO_LOST_API_ROOT}/releases/${encodeURIComponent(releaseId)}/submit`, {
    method: "POST",
  });
  return response;
}

export async function updateTooLostRelease(releaseId: string): Promise<{ release: TooLostReleaseStatusSnapshot; updated: boolean; reason: string }> {
  return requestJson<{ release: TooLostReleaseStatusSnapshot; updated: boolean; reason: string }>(`${TOO_LOST_API_ROOT}/releases/${encodeURIComponent(releaseId)}/update`, {
    method: "POST",
  });
}

export async function fetchTooLostReleaseStatus(releaseId: string): Promise<TooLostReleaseStatusSnapshot> {
  const response = await requestJson<{ status: TooLostReleaseStatusSnapshot }>(`${TOO_LOST_API_ROOT}/releases/${encodeURIComponent(releaseId)}/status`);
  return response.status;
}

export async function fetchTooLostDistributionStatus(releaseId: string): Promise<TooLostReleaseStatusSnapshot> {
  const response = await requestJson<{ status: TooLostReleaseStatusSnapshot }>(`${TOO_LOST_API_ROOT}/releases/${encodeURIComponent(releaseId)}/distribution-status`);
  return response.status;
}

export async function importTooLostAnalytics(userId: string, payload?: unknown) {
  return requestJson<{ imported: boolean; reason: string; streams: number; audience: number; earnings: number; sales: number }>(`${TOO_LOST_API_ROOT}/analytics/import`, {
    method: "POST",
    body: JSON.stringify({ userId, payload }),
  });
}

function safeJsonParse(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}
