import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api-client";
import { POLL_INTERVAL_CATALOG } from "../../lib/query-client";
import type {
  ShopInfo,
  Category,
  ProductSummary,
  ProductDetail,
  ComboSummary,
  ComboDetail,
  PageResponse,
} from "../../types/api";

export async function getShopInfo(): Promise<ShopInfo> {
  return apiFetch<ShopInfo>("/shop", { skipIdempotency: true });
}

export async function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/categories", { skipIdempotency: true });
}

export interface ProductQueryParams {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  size?: number;
}

export async function getProducts(
  params: ProductQueryParams = {},
): Promise<PageResponse<ProductSummary>> {
  return apiFetch<PageResponse<ProductSummary>>("/products", {
    params: {
      q: params.q,
      category: params.category,
      sort: params.sort,
      page: params.page ?? 0,
      size: params.size ?? 20,
    },
    skipIdempotency: true,
  });
}

export async function getProductDetail(
  idOrSlug: string,
): Promise<ProductDetail> {
  return apiFetch<ProductDetail>(`/products/${idOrSlug}`, {
    skipIdempotency: true,
  });
}

export async function getCombos(): Promise<ComboSummary[]> {
  const res = await apiFetch<PageResponse<ComboSummary> | ComboSummary[]>(
    "/combos",
    { skipIdempotency: true },
  );
  if (Array.isArray(res)) {
    return res;
  }
  return res.content || [];
}

export async function getComboDetail(idOrSlug: string): Promise<ComboDetail> {
  return apiFetch<ComboDetail>(`/combos/${idOrSlug}`, {
    skipIdempotency: true,
  });
}

// React Query Hooks (15s Polling as required by Section 10)

export function useShopInfo() {
  return useQuery({
    queryKey: ["shop"],
    queryFn: getShopInfo,
    refetchInterval: POLL_INTERVAL_CATALOG,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
    staleTime: 60000,
  });
}

export function useProducts(params: ProductQueryParams = {}) {
  return useQuery({
    queryKey: ["products", params],
    placeholderData: keepPreviousData,
    queryFn: () => getProducts(params),
    refetchInterval: POLL_INTERVAL_CATALOG,
  });
}

export function useProductDetail(idOrSlug: string) {
  return useQuery({
    queryKey: ["product", idOrSlug],
    queryFn: () => getProductDetail(idOrSlug),
    enabled: !!idOrSlug,
    refetchInterval: POLL_INTERVAL_CATALOG,
  });
}

export function useCombos() {
  return useQuery({
    queryKey: ["combos"],
    queryFn: getCombos,
    refetchInterval: POLL_INTERVAL_CATALOG,
  });
}

export function useComboDetail(idOrSlug: string) {
  return useQuery({
    queryKey: ["combo", idOrSlug],
    queryFn: () => getComboDetail(idOrSlug),
    enabled: !!idOrSlug,
    refetchInterval: POLL_INTERVAL_CATALOG,
  });
}
