import { getAccessToken } from "./supabase";
import type { ApiErrorResponse, ApiErrorDetail } from "../types/api";
import { userErrorMessage, UserFacingError } from "./user-errors";
import { notifyError } from "./feedback";
import { withRequestDeadline } from "./request-state";

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
    super(userErrorMessage({ status, code, message }));
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
  timeoutMs?: number;
  silent?: boolean;
  validate?: (data: unknown) => boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const pendingWrites = new Map<string, Promise<unknown>>();
const retryKeys = new Map<string, { key: string; createdAt: number }>();

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || options.skipIdempotency || options.body instanceof FormData) {
    return executeApiRequest<T>(endpoint, options);
  }
  const signature = JSON.stringify([method, endpoint, options.params, options.body, Array.from(new Headers(options.headers).entries()), options.idempotencyKey]);
  const pending = pendingWrites.get(signature);
  if (pending) return pending as Promise<T>;
  const now = Date.now();
  for (const [entry, intent] of retryKeys) if (now - intent.createdAt > 600000) retryKeys.delete(entry);
  const intent = retryKeys.get(signature) || { key: options.idempotencyKey || crypto.randomUUID(), createdAt: now };
  retryKeys.set(signature, intent);
  const task = executeApiRequest<T>(endpoint, { ...options, idempotencyKey: intent.key })
    .then(result => { retryKeys.delete(signature); return result; })
    .finally(() => { pendingWrites.delete(signature); });
  pendingWrites.set(signature, task);
  return task;
}

async function executeApiRequest<T>(
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
    timeoutMs,
    validate,
    silent = method.toUpperCase() === "GET",
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

  try {
    return await withRequestDeadline(async (signal) => {
      const headers = new Headers(customHeaders);

      // Attach Supabase Bearer token if present
      try {
        const token = headers.has("Authorization") ? null : await getAccessToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      } catch {
        throw new ApiError(503, "AUTH_UNAVAILABLE", "");
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
        signal,
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

      const contentType = response.headers.get("content-type");
      if (response.status !== 204 && !contentType?.includes("application/json")) throw new ApiError(502, "INVALID_RESPONSE", "");
      const result: unknown = response.status === 204 ? {} : await response.json();
      if (validate && !validate(result)) throw new ApiError(502, "INVALID_RESPONSE", "");
      return result as T;
    }, { timeoutMs, signal: restOptions.signal, write: !["GET", "HEAD"].includes(method.toUpperCase()) });
  } catch (error) {
    if (restOptions.signal?.aborted) throw error;
    const invalidWriteResponse = !["GET", "HEAD"].includes(method.toUpperCase())
      && (error instanceof SyntaxError || (error instanceof ApiError && error.code === "INVALID_RESPONSE"));
    const safeError = invalidWriteResponse
      ? new UserFacingError("Chưa xác nhận được kết quả. Kiểm tra dữ liệu hoặc trạng thái đơn trước khi thử lại.", "WRITE_RESULT_UNKNOWN")
      : error instanceof ApiError || error instanceof UserFacingError ? error
      : error instanceof SyntaxError ? new ApiError(502, "INVALID_RESPONSE", "")
      : new ApiError(0, "NETWORK_ERROR", "");
    if (!silent) notifyError(safeError);
    throw safeError;
  }
}
