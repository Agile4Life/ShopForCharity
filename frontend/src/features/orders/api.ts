import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../../lib/api-client";
import { POLL_INTERVAL_ORDERS } from "../../lib/query-client";
import type {
  OrderDetail,
  PageResponse,
  PaymentInstructions,
} from "../../types/api";

// Customer (Logged-in) Orders

export async function getCustomerOrders(
  page = 0,
  size = 20,
): Promise<PageResponse<OrderDetail>> {
  return apiFetch<PageResponse<OrderDetail>>("/me/orders", {
    params: { page, size },
    skipIdempotency: true,
  });
}

export async function getCustomerOrderDetail(id: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/me/orders/${id}`, {
    skipIdempotency: true,
  });
}

export async function cancelCustomerOrder(
  id: string,
  reason: string,
  expectedVersion: number,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/me/orders/${id}/cancel`, {
    method: "POST",
    body: { reason, expectedVersion },
    skipIdempotency: false,
  });
}

export async function reportCustomerPayment(
  id: string,
  expectedVersion: number,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/me/orders/${id}/payment-report`, {
    method: "POST",
    body: { expectedVersion },
    skipIdempotency: false,
  });
}

export async function getCustomerPaymentInstructions(
  id: string,
): Promise<PaymentInstructions> {
  return apiFetch<PaymentInstructions>(
    `/me/orders/${id}/payment-instructions`,
    {
      skipIdempotency: true,
    },
  );
}

// Guest Orders

export async function accessGuestOrder(
  orderCode: string,
  guestToken: string,
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>("/guest/orders/access", {
    method: "POST",
    body: { orderCode, guestToken },
    skipIdempotency: true,
  });
}

export async function getGuestOrderDetail(
  orderCode: string,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/guest/orders/${orderCode}`, {
    skipIdempotency: true,
  });
}

export async function cancelGuestOrder(
  orderCode: string,
  reason: string,
  expectedVersion: number,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/guest/orders/${orderCode}/cancel`, {
    method: "POST",
    body: { reason, expectedVersion },
    skipIdempotency: false,
  });
}

export async function reportGuestPayment(
  orderCode: string,
  expectedVersion: number,
): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/guest/orders/${orderCode}/payment-report`, {
    method: "POST",
    body: { expectedVersion },
    skipIdempotency: false,
  });
}

export async function getGuestPaymentInstructions(
  orderCode: string,
): Promise<PaymentInstructions> {
  return apiFetch<PaymentInstructions>(
    `/guest/orders/${orderCode}/payment-instructions`,
    {
      skipIdempotency: true,
    },
  );
}

// React Query Hooks

function refreshOnConflict(client: QueryClient, key: string[], error: Error) {
  if (error instanceof ApiError && ["VERSION_CONFLICT", "INVALID_TRANSITION", "INVALID_PAYMENT_TRANSITION"].includes(error.code)) {
    return client.invalidateQueries({ queryKey: key });
  }
}

export function useCustomerOrders(page = 0, size = 20) {
  return useQuery({
    queryKey: ["customer-orders", page, size],
    queryFn: () => getCustomerOrders(page, size),
    refetchInterval: POLL_INTERVAL_ORDERS,
  });
}

export function useCustomerOrderDetail(id: string) {
  return useQuery({
    queryKey: ["customer-order", id],
    queryFn: () => getCustomerOrderDetail(id),
    enabled: !!id,
    refetchInterval: POLL_INTERVAL_ORDERS,
  });
}

export function useCustomerPaymentInstructions(id: string, enabled = true) {
  return useQuery({
    queryKey: ["customer-payment-instructions", id],
    queryFn: () => getCustomerPaymentInstructions(id),
    enabled: !!id && enabled,
  });
}

export function useCancelCustomerOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successMessage: "Đã hủy đơn hàng." },
    mutationFn: ({
      id,
      reason,
      expectedVersion,
    }: {
      id: string;
      reason: string;
      expectedVersion: number;
    }) => cancelCustomerOrder(id, reason, expectedVersion),
    onSuccess: (order, variables) => {
      queryClient.setQueryData(["customer-order", variables.id], order);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-order", variables.id] }),
        queryClient.invalidateQueries({ queryKey: ["customer-orders"] }),
      ]);
    },
    onError: (error, variables) => refreshOnConflict(queryClient, ["customer-order", variables.id], error),
  });
}

export function useReportCustomerPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successMessage: "Đã báo chuyển khoản. Shop sẽ kiểm tra và xác nhận thanh toán." },
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) => reportCustomerPayment(id, expectedVersion),
    onSuccess: (order, variables) => {
      queryClient.setQueryData(["customer-order", variables.id], order);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer-order", variables.id] }),
        queryClient.invalidateQueries({ queryKey: ["customer-orders"] }),
      ]);
    },
    onError: (error, variables) => refreshOnConflict(queryClient, ["customer-order", variables.id], error),
  });
}

export function useGuestOrderDetail(orderCode: string, enabled = true) {
  return useQuery({
    queryKey: ["guest-order", orderCode],
    queryFn: () => getGuestOrderDetail(orderCode),
    enabled: !!orderCode && enabled,
    refetchInterval: POLL_INTERVAL_ORDERS,
  });
}

export function useGuestPaymentInstructions(orderCode: string, enabled = true) {
  return useQuery({
    queryKey: ["guest-payment-instructions", orderCode],
    queryFn: () => getGuestPaymentInstructions(orderCode),
    enabled: !!orderCode && enabled,
  });
}

export function useCancelGuestOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successMessage: "Đã hủy đơn hàng." },
    mutationFn: ({
      orderCode,
      reason,
      expectedVersion,
    }: {
      orderCode: string;
      reason: string;
      expectedVersion: number;
    }) => cancelGuestOrder(orderCode, reason, expectedVersion),
    onSuccess: (order, variables) => {
      queryClient.setQueryData(["guest-order", variables.orderCode], order);
      return queryClient.invalidateQueries({ queryKey: ["guest-order", variables.orderCode] });
    },
    onError: (error, variables) => refreshOnConflict(queryClient, ["guest-order", variables.orderCode], error),
  });
}

export function useReportGuestPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    meta: { successMessage: "Đã báo chuyển khoản. Shop sẽ kiểm tra và xác nhận thanh toán." },
    mutationFn: ({
      orderCode,
      expectedVersion,
    }: {
      orderCode: string;
      expectedVersion: number;
    }) => reportGuestPayment(orderCode, expectedVersion),
    onSuccess: (order, variables) => {
      queryClient.setQueryData(["guest-order", variables.orderCode], order);
      return queryClient.invalidateQueries({ queryKey: ["guest-order", variables.orderCode] });
    },
    onError: (error, variables) => refreshOnConflict(queryClient, ["guest-order", variables.orderCode], error),
  });
}
