import { getAccessToken } from "./supabase";
import type { ApiErrorResponse, ApiErrorDetail } from "../types/api";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorDetail[];
  requestId?: string;
  timestamp?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
    requestId?: string,
    timestamp?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.timestamp = timestamp;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
  skipIdempotency?: boolean;
  idempotencyKey?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";

export async function apiFetch<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    params,
    headers: customHeaders = {},
    skipIdempotency = false,
    idempotencyKey,
    ...restOptions
  } = options;

  let url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const headers = new Headers(customHeaders);

  // Attach Supabase Bearer token if present
  try {
    const token = headers.has("Authorization") ? null : await getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (err) {
    console.warn("Could not retrieve Supabase session token", err);
  }

  // Mutating requests: send Idempotency-Key if not skipped
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(
    method.toUpperCase(),
  );
  if (isMutation && !skipIdempotency && !headers.has("Idempotency-Key")) {
    const key =
      idempotencyKey ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    headers.set("Idempotency-Key", key);
  }

  let finalBody: BodyInit | undefined;
  if (body instanceof FormData) {
    finalBody = body;
    // Don't set Content-Type header when body is FormData; browser sets boundary automatically
  } else if (body !== undefined) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    finalBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: finalBody,
    credentials: "include", // Ensure HttpOnly cookies are included for guest checkout sessions
    ...restOptions,
  });

  if (!response.ok) {
    let errorData: ApiErrorResponse | null = null;
    try {
      errorData = (await response.json()) as ApiErrorResponse;
    } catch {
      // response is not json
    }

    const code = errorData?.code || `HTTP_${response.status}`;
    const message =
      errorData?.message || response.statusText || "Yêu cầu không thành công";
    throw new ApiError(
      response.status,
      code,
      message,
      errorData?.details,
      errorData?.requestId,
      errorData?.timestamp,
    );
  }

  // If response is 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}
