import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';
import type {
  QuoteRequest,
  QuoteResponse,
  CreateOrderRequest,
  CreateOrderResponse,
} from '../../types/api';

export async function createGuestSession(): Promise<{ sessionId: string }> {
  return apiFetch<{ sessionId: string }>('/checkout/session', {
    method: 'POST',
    skipIdempotency: false,
  });
}

export async function getCheckoutQuote(data: QuoteRequest): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>('/checkout/quote', {
    method: 'POST',
    body: data,
    skipIdempotency: true,
  });
}

export async function createOrder(data: CreateOrderRequest): Promise<CreateOrderResponse> {
  return apiFetch<CreateOrderResponse>('/orders', {
    method: 'POST',
    body: data,
    skipIdempotency: false, // Must generate Idempotency-Key
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
