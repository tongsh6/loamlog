import {
  CAPTURE_PATH,
  DEFAULT_DAEMON_HOST,
  DEFAULT_DAEMON_PORT,
  type CaptureRequest,
} from "@loamlog/core";

export interface ForwardCaptureOptions {
  request: CaptureRequest;
  daemonUrl?: string;
  fetchImpl?: typeof fetch;
}

function defaultDaemonUrl(): string {
  return `http://${DEFAULT_DAEMON_HOST}:${DEFAULT_DAEMON_PORT}`;
}

export async function forwardCaptureEvent(options: ForwardCaptureOptions): Promise<void> {
  const daemonUrl = options.daemonUrl ?? defaultDaemonUrl();
  const requestUrl = new URL(CAPTURE_PATH, daemonUrl).toString();
  const fetchImpl = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetchImpl(requestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(options.request),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`daemon rejected capture request: ${response.status}`);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
