import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../../lib/api-client";
import { UserFacingError } from "../../lib/user-errors";
import { notifyError } from "../../lib/feedback";
import {
  POLL_INTERVAL_ORDERS,
  POLL_INTERVAL_DASHBOARD,
} from "../../lib/query-client";
import type {
  SellerDashboardSummary,
  OrderDetail,
  PageResponse,
  RecordContactAttemptRequest,
  AcceptOrderRequest,
  TransitionOrderRequest,
  ConfirmPaymentRequest,
  DismissPaymentReportRequest,
  ConfirmRefundRequest,
  StockAdjustmentRequest,
  ProductSummary,
  ProductDetail,
  CreateProductRequest,
  UpdateProductRequest,
  ComboSummary,
  ComboDetail,
  CreateComboRequest,
  UpdateComboRequest,
  ShopSettings,
  UpdateShopSettingsRequest,
  PickupPoint,
  NotificationItem,
  AuditLogItem,
  AssetUploadResponse,
  AssetType,
} from "../../types/api";

// --- Dashboard ---
export async function getSellerDashboard(): Promise<SellerDashboardSummary> {
  return apiFetch<SellerDashboardSummary>("/seller/dashboard", {
    skipIdempotency: true,
  });
}

export function useSellerDashboard() {
  return useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: getSellerDashboard,
    refetchInterval: POLL_INTERVAL_DASHBOARD,
  });
}

// --- Orders ---
export interface SellerOrderFilters {
  status?: string;
  paymentStatus?: string;
  orderCode?: string;
  date?: string;
  page?: number;
  size?: number;
}

export async function getSellerOrders(
  filters: SellerOrderFilters = {},
): Promise<PageResponse<OrderDetail>> {
  return apiFetch<PageResponse<OrderDetail>>("/seller/orders", {
    params: {
      status: filters.status,
      paymentStatus: filters.paymentStatus,
      orderCode: filters.orderCode,
      date: filters.date,
      page: filters.page ?? 0,
      size: filters.size ?? 20,
    },
    skipIdempotency: true,
  });
}

export function useSellerOrders(filters: SellerOrderFilters = {}) {
  return useQuery({
    queryKey: ["seller-orders", filters],
    queryFn: () => getSellerOrders(filters),
    refetchInterval: POLL_INTERVAL_ORDERS,
  });
}

export async function getSellerOrderDetail(id: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/seller/orders/${id}`, {
    skipIdempotency: true,
  });
}

export function useSellerOrderDetail(id: string) {
  return useQuery({
    queryKey: ["seller-order", id],
    queryFn: () => getSellerOrderDetail(id),
    enabled: !!id,
    refetchInterval: POLL_INTERVAL_ORDERS,
  });
}

// Order Actions
export function useSellerOrderActions(orderId: string) {
  const queryClient = useQueryClient();

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["seller-order", orderId] }),
    queryClient.invalidateQueries({ queryKey: ["seller-orders"] }),
    queryClient.invalidateQueries({ queryKey: ["seller-dashboard"] }),
  ]);
  const invalidate = async (order: OrderDetail) => {
    queryClient.setQueryData(["seller-order", orderId], order);
    await refresh();
  };
  const recoverConflict = async (error: Error) => {
    if (error instanceof ApiError && ["INVALID_TRANSITION", "VERSION_CONFLICT"].includes(error.code)) {
      await refresh();
    }
  };

  const recordContactAttempt = useMutation({
    meta: { successMessage: "Đã ghi nhận liên hệ." },
    mutationFn: (data: RecordContactAttemptRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/contact-attempts`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const acceptOrder = useMutation({
    meta: { successMessage: "Đã chấp nhận đơn hàng." },
    mutationFn: (data: AcceptOrderRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/accept`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const rejectOrder = useMutation({
    meta: { successMessage: "Đã từ chối đơn hàng." },
    mutationFn: (data: TransitionOrderRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/reject`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const prepareOrder = useMutation({
    meta: { successMessage: "Đã chuyển đơn sang đang chuẩn bị." },
    mutationFn: (data: TransitionOrderRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/prepare`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const readyOrder = useMutation({
    meta: { successMessage: "Đã chuyển đơn sang sẵn sàng nhận." },
    mutationFn: (data: TransitionOrderRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/ready`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const completeOrder = useMutation({
    meta: { successMessage: "Đã hoàn tất bàn giao đơn hàng." },
    mutationFn: (data: TransitionOrderRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/complete`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const cancelOrder = useMutation({
    meta: { successMessage: "Đã hủy đơn hàng." },
    mutationFn: (data: TransitionOrderRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/cancel`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const confirmPayment = useMutation({
    meta: { successMessage: "Đã ghi nhận thanh toán." },
    mutationFn: (data: ConfirmPaymentRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/confirm-payment`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const dismissPaymentReport = useMutation({
    meta: { successMessage: "Đã cập nhật kết quả kiểm tra thanh toán." },
    mutationFn: (data: DismissPaymentReportRequest) =>
      apiFetch<OrderDetail>(
        `/seller/orders/${orderId}/dismiss-payment-report`,
        {
          method: "POST",
          body: data,
        },
      ),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  const confirmRefund = useMutation({
    meta: { successMessage: "Đã ghi nhận hoàn tiền." },
    mutationFn: (data: ConfirmRefundRequest) =>
      apiFetch<OrderDetail>(`/seller/orders/${orderId}/confirm-refund`, {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidate,
    onError: recoverConflict,
  });

  return {
    recordContactAttempt,
    acceptOrder,
    rejectOrder,
    prepareOrder,
    readyOrder,
    completeOrder,
    cancelOrder,
    confirmPayment,
    dismissPaymentReport,
    confirmRefund,
  };
}

// --- Products ---
export async function getSellerProducts(
  page = 0,
  size = 20,
): Promise<PageResponse<ProductSummary>> {
  return apiFetch<PageResponse<ProductSummary>>("/seller/products", {
    params: { page, size },
    skipIdempotency: true,
  });
}

export function useSellerProducts(page = 0, size = 20) {
  return useQuery({
    queryKey: ["seller-products", page, size],
    queryFn: () => getSellerProducts(page, size),
  });
}

export async function getSellerProductDetail(
  id: string,
): Promise<ProductDetail> {
  return apiFetch<ProductDetail>(`/seller/products/${id}`, {
    skipIdempotency: true,
  });
}

export function useSellerProductDetail(id: string) {
  return useQuery({
    queryKey: ["seller-product", id],
    queryFn: () => getSellerProductDetail(id),
    enabled: !!id && id !== "new",
    refetchOnWindowFocus: false,
  });
}

export function useSellerProductMutations() {
  const queryClient = useQueryClient();

  const createProduct = useMutation({
    meta: { successMessage: "Đã thêm sản phẩm." },
    mutationFn: (data: CreateProductRequest) =>
      apiFetch<ProductDetail>("/seller/products", {
        method: "POST",
        body: data,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-products"] }),
  });

  const updateProduct = useMutation({
    meta: { successMessage: "Đã lưu sản phẩm." },
    mutationFn: ({ id, data }: { id: string; data: UpdateProductRequest }) =>
      apiFetch<ProductDetail>(`/seller/products/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["seller-product", id] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    },
  });

  const archiveProduct = useMutation({
    meta: { successMessage: "Đã ẩn sản phẩm." },
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) =>
      apiFetch<void>(`/seller/products/${id}/archive`, {
        method: "POST",
        body: { expectedVersion },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-products"] }),
  });

  const activateProduct = useMutation({
    meta: { successMessage: "Đã mở bán sản phẩm." },
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) =>
      apiFetch<void>(`/seller/products/${id}/activate`, {
        method: "POST",
        body: { expectedVersion },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-products"] }),
  });

  const adjustStock = useMutation({
    meta: { successMessage: "Đã điều chỉnh tồn kho." },
    mutationFn: ({ id, data }: { id: string; data: StockAdjustmentRequest }) =>
      apiFetch<ProductDetail>(`/seller/products/${id}/stock-adjustments`, {
        method: "POST",
        body: data,
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["seller-product", id] });
      queryClient.invalidateQueries({ queryKey: ["seller-products"] });
    },
  });

  return {
    createProduct,
    updateProduct,
    archiveProduct,
    activateProduct,
    adjustStock,
  };
}

// --- Combos ---
export async function getSellerCombos(): Promise<ComboSummary[]> {
  const res = await apiFetch<PageResponse<ComboSummary> | ComboSummary[]>(
    "/seller/combos",
    { skipIdempotency: true },
  );
  if (Array.isArray(res)) {
    return res;
  }
  return res.content || [];
}

export function useSellerCombos() {
  return useQuery({
    queryKey: ["seller-combos"],
    queryFn: getSellerCombos,
  });
}

export async function getSellerComboDetail(id: string): Promise<ComboDetail> {
  return apiFetch<ComboDetail>(`/seller/combos/${id}`, {
    skipIdempotency: true,
  });
}

export function useSellerComboDetail(id: string) {
  return useQuery({
    queryKey: ["seller-combo", id],
    queryFn: () => getSellerComboDetail(id),
    enabled: !!id && id !== "new",
    refetchOnWindowFocus: false,
  });
}

export function useSellerComboMutations() {
  const queryClient = useQueryClient();

  const createCombo = useMutation({
    meta: { successMessage: "Đã thêm combo." },
    mutationFn: (data: CreateComboRequest) =>
      apiFetch<ComboDetail>("/seller/combos", { method: "POST", body: data }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-combos"] }),
  });

  const updateCombo = useMutation({
    meta: { successMessage: "Đã lưu combo." },
    mutationFn: ({ id, data }: { id: string; data: UpdateComboRequest }) =>
      apiFetch<ComboDetail>(`/seller/combos/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["seller-combo", id] });
      queryClient.invalidateQueries({ queryKey: ["seller-combos"] });
    },
  });

  const archiveCombo = useMutation({
    meta: { successMessage: "Đã ẩn combo." },
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) =>
      apiFetch<void>(`/seller/combos/${id}/archive`, {
        method: "POST",
        body: { expectedVersion },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-combos"] }),
  });

  const activateCombo = useMutation({
    meta: { successMessage: "Đã mở bán combo." },
    mutationFn: ({
      id,
      expectedVersion,
    }: {
      id: string;
      expectedVersion: number;
    }) =>
      apiFetch<void>(`/seller/combos/${id}/activate`, {
        method: "POST",
        body: { expectedVersion },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-combos"] }),
  });

  return { createCombo, updateCombo, archiveCombo, activateCombo };
}

// --- Asset Upload ---
export async function uploadAsset(
  file: File,
  type: AssetType,
): Promise<AssetUploadResponse> {
  if (file.size > 4 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    const error = new UserFacingError(file.size > 4 * 1024 * 1024
      ? "Ảnh vượt quá dung lượng cho phép. Chọn ảnh nhỏ hơn 4 MiB."
      : "Định dạng ảnh chưa được hỗ trợ. Chọn JPEG, PNG hoặc WebP.");
    notifyError(error);
    throw error;
  }
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  return apiFetch<AssetUploadResponse>("/seller/assets", {
    method: "POST",
    body: formData,
    validate: value => {
      if (!value || typeof value !== "object") return false;
      const asset = value as Partial<AssetUploadResponse>;
      return typeof asset.assetId === "string" && !!asset.assetId
        && typeof asset.url === "string" && !!asset.url;
    },
  });
}

// --- Shop Settings & Pickup Points ---
export async function getSellerShopSettings(): Promise<ShopSettings> {
  return apiFetch<ShopSettings>("/seller/shop-settings", {
    skipIdempotency: true,
  });
}

export function useSellerShopSettings() {
  return useQuery({
    queryKey: ["seller-shop-settings"],
    queryFn: getSellerShopSettings,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateShopSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateShopSettingsRequest) =>
      apiFetch<ShopSettings>("/seller/shop-settings", {
        method: "PATCH",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["seller-shop-settings"] });
      queryClient.invalidateQueries({ queryKey: ["shop"] });
    },
  });
}

export async function getSellerPickupPoints(): Promise<PickupPoint[]> {
  return apiFetch<PickupPoint[]>("/seller/pickup-points", {
    skipIdempotency: true,
  });
}

export function useSellerPickupPoints() {
  return useQuery({
    queryKey: ["seller-pickup-points"],
    queryFn: getSellerPickupPoints,
  });
}

export function useSellerPickupPointMutations() {
  const queryClient = useQueryClient();

  const createPickupPoint = useMutation({
    mutationFn: (data: Omit<PickupPoint, "id">) =>
      apiFetch<PickupPoint>("/seller/pickup-points", {
        method: "POST",
        body: data,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seller-pickup-points"] }),
        queryClient.invalidateQueries({ queryKey: ["shop"] }),
      ]);
    },
  });

  const updatePickupPoint = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PickupPoint> & { expectedVersion?: number } }) =>
      apiFetch<PickupPoint>(`/seller/pickup-points/${id}`, {
        method: "PATCH",
        body: data,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seller-pickup-points"] }),
        queryClient.invalidateQueries({ queryKey: ["shop"] }),
      ]);
    },
  });

  return { createPickupPoint, updatePickupPoint };
}

// --- Notifications ---
export async function getSellerNotifications(): Promise<NotificationItem[]> {
  const res = await apiFetch<
    PageResponse<NotificationItem> | NotificationItem[]
  >("/seller/notifications", { skipIdempotency: true });
  if (Array.isArray(res)) {
    return res;
  }
  return res.content || [];
}

export function useSellerNotifications() {
  return useQuery({
    queryKey: ["seller-notifications"],
    queryFn: getSellerNotifications,
    refetchInterval: POLL_INTERVAL_ORDERS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/seller/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seller-notifications"] }),
  });
}

// --- Audit Logs ---
export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  date?: string;
  page?: number;
  size?: number;
}

export async function getSellerAuditLogs(
  filters: AuditLogFilters = {},
): Promise<PageResponse<AuditLogItem>> {
  return apiFetch<PageResponse<AuditLogItem>>("/seller/audit-logs", {
    params: {
      action: filters.action,
      entityType: filters.entityType,
      date: filters.date,
      page: filters.page ?? 0,
      size: filters.size ?? 20,
    },
    skipIdempotency: true,
  });
}

export function useSellerAuditLogs(filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: ["seller-audit-logs", filters],
    queryFn: () => getSellerAuditLogs(filters),
  });
}
