import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import type {
  QuoteRequest,
  QuoteResponse,
  CreateOrderRequest,
  CreateOrderResponse,
} from "../../types/api";

export async function createGuestSession(): Promise<{ sessionId: string }> {
  return apiFetch<{ sessionId: string }>("/checkout/session", {
    method: "POST",
    skipIdempotency: false,
  });
}

export async function getCheckoutQuote(
  data: QuoteRequest,
): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>("/checkout/quote", {
    method: "POST",
    body: data,
    skipIdempotency: true,
    validate: value => {
      if (!value || typeof value !== "object") return false;
      const quote = value as Partial<QuoteResponse>;
      return typeof quote.quoteToken === "string" && !!quote.quoteToken
        && typeof quote.expiresAt === "string" && Number.isFinite(Date.parse(quote.expiresAt))
        && typeof quote.total === "number" && Number.isFinite(quote.total)
        && typeof quote.subtotal === "number" && Number.isFinite(quote.subtotal)
        && Array.isArray(quote.items);
    },
  });
}

export async function createOrder(
  data: CreateOrderRequest,
): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>("/orders", {
    method: "POST",
    body: data,
    skipIdempotency: false, // Must generate Idempotency-Key
    validate: value => {
      if (!value || typeof value !== "object") return false;
      const order = value as Partial<CreateOrderResponse>;
      return typeof order.orderId === "string" && !!order.orderId
        && typeof order.orderCode === "string" && !!order.orderCode
        && typeof order.total === "number" && Number.isFinite(order.total);
    },
  });
}

// React Query Mutation Hooks

export function useCreateGuestSession() {
  return useMutation({
    mutationFn: createGuestSession,
  });
}

export function useCheckoutQuote() {
  return useMutation({
    mutationFn: (data: QuoteRequest) => getCheckoutQuote(data),
  });
}

export function useCreateOrder() {
  return useMutation({
    mutationFn: (data: CreateOrderRequest) => createOrder(data),
  });
}
