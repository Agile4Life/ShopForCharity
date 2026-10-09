// API Domain & DTO Types matching school-shop-spec.md and backend entities

export type Role = 'CUSTOMER' | 'SELLER';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export type OrderStatus =
  | 'PENDING_CONTACT'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type PaymentStatus =
  | 'UNPAID'
  | 'REPORTED'
  | 'PAID'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER';

export type ItemKind = 'PRODUCT' | 'COMBO';

export type ContactChannel = 'PHONE' | 'EMAIL' | 'IN_PERSON';

export type ContactOutcome = 'SUCCESS' | 'NO_RESPONSE' | 'FAILED';

export type AssetType = 'PRODUCT_IMAGE' | 'PAYMENT_QR';

// Standard API Error
export interface ApiErrorDetail {
  field?: string;
  catalogId?: string;
  availableQuantity?: number;
  message?: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
  timestamp?: string;
}

// User Profile
export interface Profile {
  id: string;
  authUserId: string;
  fullName: string;
  phone: string;
  email: string;
  role: Role;
  active: boolean;
  version?: number;
}

// Shop & Pickup Points
export interface PickupPoint {
  id: string;
  shopId?: string;
  name: string;
  instructions: string;
  active: boolean;
}

export interface ShopInfo {
  id: string;
  name: string;
  contactPhone: string;
  contactEmail: string;
  acceptingOrders: boolean;
  pickupPoints: PickupPoint[];
}

export interface Category {
  id: string;
  shopId?: string;
  code: string;
  name: string;
  active: boolean;
}

// Product
export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  imageAssetId?: string;
  categoryId: string;
  categoryName?: string;
  availableStock: number;
  isSoldOut: boolean;
  status: ProductStatus;
  version?: number;
  inventoryVersion?: number;
}

export interface ProductDetail extends ProductSummary {
  ingredients?: string;
  allergens?: string;
  preservationInstructions?: string;
  stockOnHand?: number;
  stockReserved?: number;
  version: number;
  inventoryVersion?: number;
}

// Combo
export interface ComboComponentSummary {
  productId: string;
  productName: string;
  quantity: number;
  availableStock?: number;
}

export interface ComboSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  imageAssetId?: string;
  availableStock: number;
  isSoldOut: boolean;
  status: ProductStatus;
  items: ComboComponentSummary[];
  version?: number;
}

export interface ComboDetail extends ComboSummary {
  version: number;
}

// Pagination
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

// Cart Item (Stored locally: catalogId + kind + quantity)
export interface CartItem {
  kind: ItemKind;
  catalogId: string;
  quantity: number;
  // Local cached display metadata
  name?: string;
  price?: number;
  imageUrl?: string;
  slug?: string;
}

// Checkout Quote
export interface QuoteItemRequest {
  kind: ItemKind;
  catalogId: string;
  quantity: number;
}

export interface QuoteRequest {
  items: QuoteItemRequest[];
  paymentMethod?: PaymentMethod;
}

export interface QuoteItemResponse {
  kind: ItemKind;
  catalogId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  availableStock: number;
  isAvailable: boolean;
}

export interface QuoteResponse {
  quoteToken: string;
  expiresAt: string;
  subtotal: number;
  total: number;
  items: QuoteItemResponse[];
}

// Buyer Form
export interface BuyerInfo {
  fullName: string;
  phone: string;
  email: string;
  className?: string;
}

// Order Creation
export interface CreateOrderRequest {
  quoteToken: string;
  items: QuoteItemRequest[];
  buyer: BuyerInfo;
  pickupPointId: string;
  requestedPickupAt?: string;
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  orderCode: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  reservationExpiresAt: string;
  version: number;
  guestAccessToken?: string;
}

// Order Details & History
export interface OrderItemSnapshot {
  id: string;
  kind: ItemKind;
  productId?: string;
  comboId?: string;
  nameSnapshot: string;
  imageUrlSnapshot?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderStatusHistoryItem {
  id: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  actorType: string;
  reason?: string;
  createdAt: string;
}

export interface ContactAttemptItem {
  id: string;
  channel: ContactChannel;
  outcome: ContactOutcome;
  note?: string;
  createdAt: string;
  sellerId?: string;
}

export interface PaymentEventItem {
  id: string;
  type: string;
  fromStatus?: PaymentStatus;
  toStatus: PaymentStatus;
  amount?: number;
  bankReference?: string;
  note?: string;
  createdAt: string;
}

export interface OrderDetail {
  id: string;
  orderCode: string;
  customerId?: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  buyerClass?: string;
  pickupPointName: string;
  pickupInstructions?: string;
  requestedPickupAt?: string;
  confirmedPickupAt?: string;
  note?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  subtotal: number;
  total: number;
  reservationExpiresAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemSnapshot[];
  statusHistory?: OrderStatusHistoryItem[];
  // Seller exclusive details
  contactAttempts?: ContactAttemptItem[];
  paymentEvents?: PaymentEventItem[];
}

// Payment Instructions
export interface PaymentInstructions {
  orderCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  transferContent: string;
  qrSignedUrl?: string;
}

// Seller Dashboard
export interface SellerDashboardSummary {
  pendingCount: number;
  readyCount: number;
  completedRevenue: number;
  pendingRevenue: number;
}

// Seller Mutations
export interface RecordContactAttemptRequest {
  channel: ContactChannel;
  outcome: ContactOutcome;
  note?: string;
  expectedVersion: number;
}

export interface AcceptOrderRequest {
  confirmedPickupPointId: string;
  confirmedPickupAt: string;
  expectedVersion: number;
}

export interface TransitionOrderRequest {
  reason?: string;
  expectedVersion: number;
}

export interface ConfirmPaymentRequest {
  amount: number;
  bankReference?: string;
  note?: string;
  expectedVersion: number;
}

export interface DismissPaymentReportRequest {
  reason: string;
  expectedVersion: number;
}

export interface ConfirmRefundRequest {
  amount: number;
  bankReference?: string;
  note?: string;
  expectedVersion: number;
}

export interface StockAdjustmentRequest {
  deltaOnHand: number;
  reason: string;
  expectedVersion: number;
}

// Seller Catalog Forms
export interface CreateProductRequest {
  name: string;
  categoryId: string;
  description: string;
  price: number;
  stockOnHand: number;
  imageAssetId?: string;
  ingredients?: string;
  allergens?: string;
  preservationInstructions?: string;
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {
  expectedVersion: number;
}

export interface CreateComboRequest {
  name: string;
  description: string;
  price: number;
  imageAssetId?: string;
  items: Array<{ productId: string; quantity: number }>;
}

export interface UpdateComboRequest extends Partial<CreateComboRequest> {
  expectedVersion: number;
}

// Shop Settings
export interface ShopSettings {
  id: string;
  name: string;
  contactPhone: string;
  contactEmail: string;
  acceptingOrders: boolean;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  qrAssetId?: string;
  qrUrl?: string;
  version: number;
}

export interface UpdateShopSettingsRequest {
  name?: string;
  contactPhone?: string;
  contactEmail?: string;
  acceptingOrders?: boolean;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  qrAssetId?: string;
  expectedVersion: number;
}

// Asset Upload
export interface AssetUploadResponse {
  assetId: string;
  objectPath: string;
  url: string;
}

// Notification & Audit
export interface NotificationItem {
  id: string;
  recipientProfileId: string;
  type: string;
  orderId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  actorId?: string;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  safeBefore?: string;
  safeAfter?: string;
  requestId?: string;
  createdAt: string;
}
