import { notifyError as notify } from "../../components/Usability";
import { userErrorMessage } from "../../lib/user-errors";
import { notify as showFeedback } from "../../components/Usability";
import React, { useState, useEffect, useRef } from "react";
import {
  Settings,
  CreditCard,
  QrCode,
  MapPin,
  Plus,
  Upload,
  LoaderCircle,
} from "lucide-react";
import {
  useSellerShopSettings,
  useUpdateShopSettings,
  useSellerPickupPoints,
  useSellerPickupPointMutations,
  uploadAsset,
} from "./api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { ErrorMessage } from "../../components/ErrorMessage";
import { Modal } from "../../components/Modal";
import { AssetImage } from "../../components/AssetImage";

export const SellerSettingsPage: React.FC = () => {
  const { data: settings, isLoading, error, refetch } = useSellerShopSettings();
  const updateSettingsMutation = useUpdateShopSettings();

  const { data: pickupPoints = [], isLoading: pointsLoading, error: pointsError, refetch: refetchPoints } = useSellerPickupPoints();
  const pointMutations = useSellerPickupPointMutations();

  // Settings form states
  const [shopName, setShopName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [acceptingOrders, setAcceptingOrders] = useState(true);

  // Bank & QR states
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [qrAssetId, setQrAssetId] = useState<string | undefined>();
  const [qrUrl, setQrUrl] = useState<string | undefined>();
  const [uploadingQr, setUploadingQr] = useState(false);

  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  // Pickup Point modal
  const [pointModalOpen, setPointModalOpen] = useState(false);
  const [newPointName, setNewPointName] = useState("");
  const [newPointInstructions, setNewPointInstructions] = useState("");
  const [pointError, setPointError] = useState<string | null>(null);
  const pointNameRef = useRef<HTMLInputElement>(null);
  const pointSaveInFlight = useRef(false);
  const pointSaving = pointMutations.createPickupPoint.isPending;
  const closePointModal = () => {
    if (pointSaving || pointSaveInFlight.current) return;
    setPointModalOpen(false);
    setNewPointName("");
    setNewPointInstructions("");
    setPointError(null);
  };

  useEffect(() => {
    if (settings) {
      setShopName(settings.name || "");
      setContactPhone(settings.contactPhone || "");
      setContactEmail(settings.contactEmail || "");
      setAcceptingOrders(settings.acceptingOrders);
      setBankName(settings.bankName || "");
      setAccountNumber(settings.accountNumber || "");
      setAccountHolder(settings.accountHolder || "");
      setQrAssetId(settings.qrAssetId);
      setQrUrl(settings.qrUrl);
    }
  }, [settings]);

  const handleQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingQr(true);
    try {
      const res = await uploadAsset(file, "PAYMENT_QR");
      setQrAssetId(res.assetId);
      setQrUrl(res.url);
    } catch (err: any) {
      notify(err);
    } finally {
      setUploadingQr(false);
      e.target.value = "";
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingQr || updateSettingsMutation.isPending) return;
    setSettingsNotice(null);
    try {
      await updateSettingsMutation.mutateAsync({
        name: shopName.trim(),
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim(),
        acceptingOrders,
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        accountHolder: accountHolder.trim() || undefined,
        qrAssetId,
        expectedVersion: settings?.version ?? 0,
      });
      setSettingsNotice("Cập nhật cấu hình shop và ngân hàng thành công!");
      setTimeout(() => setSettingsNotice(null), 3000);
    } catch (err: any) {
      notify(err);
    }
  };

  const handleCreatePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pointSaving || pointSaveInFlight.current) return;
    if (!newPointName.trim()) {
      setPointError("Vui lòng nhập tên điểm nhận hàng.");
      pointNameRef.current?.focus();
      return;
    }
    setPointError(null);
    pointSaveInFlight.current = true;

    try {
      await pointMutations.createPickupPoint.mutateAsync({
        name: newPointName.trim(),
        instructions: newPointInstructions.trim(),
        active: true,
      });
    } catch (error) {
      setPointError(
        userErrorMessage(error, "Chưa lưu được thay đổi. Thử lại sau."),
      );
      return;
    } finally {
      pointSaveInFlight.current = false;
    }
    setPointModalOpen(false);
    setNewPointName("");
    setNewPointInstructions("");
    showFeedback("Đã thêm điểm nhận hàng. Khách có thể chọn khi đặt đơn.", { tone: "success" });
  };

  const handleTogglePointActive = async (
    id: string,
    currentActive: boolean,
  ) => {
    try {
      await pointMutations.updatePickupPoint.mutateAsync({
        id,
        data: {
          active: !currentActive,
          expectedVersion: pickupPoints.find((point) => point.id === id)?.version,
        },
      });
    } catch (error) {
      notify(error);
      return;
    }
    showFeedback(currentActive ? "Đã ẩn điểm nhận hàng." : "Đã mở lại điểm nhận hàng.", { tone: "success" });
  };

  if (isLoading) {
    return <LoadingSpinner message="Đang tải thông tin cấu hình shop..." />;
  }

  if (error && !settings) {
    return (
      <div className="container mt-4">
        <ErrorMessage error={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="seller-settings-page container">
      <h1 className="page-title mb-4">
        <Settings size={24} /> Cấu hình Shop & Thanh toán
      </h1>

      {settingsNotice && (
        <div className="alert-box alert-success mb-4 text-sm">
          {settingsNotice}
        </div>
      )}

      <div className="settings-grid">
        {/* Main Settings Form */}
        <div className="card">
          <form onSubmit={handleSaveSettings}>
            <h2 className="section-subtitle mb-3">Thông tin cửa hàng</h2>

            <div className="form-group mb-4">
              <label className="toggle-switch-label flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptingOrders}
                  onChange={(e) => setAcceptingOrders(e.target.checked)}
                  className="toggle-checkbox"
                />
                <div>
                  <strong>
                    {acceptingOrders ? "Đang mở nhận đơn" : "Tạm dừng nhận đơn"}
                  </strong>
                  <p className="text-xs text-muted">
                    {acceptingOrders
                      ? "Khách hàng có thể đặt đơn bình thường"
                      : "Website sẽ hiển thị thông báo tạm dừng nhận đơn mới"}
                  </p>
                </div>
              </label>
            </div>

            <div className="form-group">
              <label
                className="form-label"
                htmlFor="sellersettingspage-field-1"
              >
                Tên cửa hàng *:
              </label>
              <input
                id="sellersettingspage-field-1"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor="sellersettingspage-field-2"
                >
                  Số điện thoại liên hệ *:
                </label>
                <input
                  id="sellersettingspage-field-2"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="input-field"
                  required
                />
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor="sellersettingspage-field-3"
                >
                  Email hỗ trợ *:
                </label>
                <input
                  id="sellersettingspage-field-3"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            </div>

            <div className="divider my-4" />

            <h2 className="section-subtitle mb-3 flex items-center gap-2">
              <CreditCard size={18} /> Cấu hình Chuyển khoản & Mã QR Shop
            </h2>
            <p className="text-xs text-muted mb-3">
              Thông tin tài khoản và ảnh QR sẽ hiển thị cho khách khi đơn hàng
              chuyển khoản được chấp nhận.
            </p>

            <div className="form-grid-2">
              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor="sellersettingspage-field-4"
                >
                  Tên Ngân hàng:
                </label>
                <input
                  id="sellersettingspage-field-4"
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Ví dụ: MB Bank / Vietcombank / Techcombank"
                  className="input-field"
                />
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  htmlFor="sellersettingspage-field-5"
                >
                  Số tài khoản nhận tiền:
                </label>
                <input
                  id="sellersettingspage-field-5"
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Ví dụ: 0987654321..."
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-group">
              <label
                className="form-label"
                htmlFor="sellersettingspage-field-6"
              >
                Tên chủ tài khoản (in hoa không dấu):
              </label>
              <input
                id="sellersettingspage-field-6"
                type="text"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="NGUYEN VAN A"
                className="input-field"
              />
            </div>

            {/* QR Upload */}
            <div className="form-group mt-3">
              <label
                className="form-label"
                htmlFor="sellersettingspage-field-7"
              >
                Ảnh mã QR tĩnh của Shop:
              </label>
              <div className="settings-qr-upload flex items-center gap-4">
                <div className="qr-preview-box">
                  {qrUrl ? (
                    <AssetImage src={qrUrl} alt="Mã QR" className="qr-preview-img" />
                  ) : (
                    <div className="qr-preview-empty">
                      <QrCode size={32} />
                      <span className="text-xs">Chưa có QR</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="btn-secondary-sm cursor-pointer">
                    <Upload size={14} />{" "}
                    {uploadingQr ? "Đang tải..." : "Tải ảnh QR mới"}
                    <input
                      id="sellersettingspage-field-7"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleQrUpload}
                      className="hidden"
                      disabled={uploadingQr}
                    />
                  </label>
                  {qrAssetId && (
                    <span className="block text-xs text-green mt-1">
                      Đã gắn Asset QR
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={uploadingQr || updateSettingsMutation.isPending}
              className="btn-primary full-width mt-4"
            >
              {updateSettingsMutation.isPending
                ? "Đang lưu..."
                : "Lưu toàn bộ cài đặt"}
            </button>
          </form>
        </div>

        {/* Pickup Points Management */}
        <div className="card pickup-points-card">
          <div className="pickup-points-heading">
            <h2 className="section-subtitle flex items-center gap-2">
              <MapPin size={18} /> Điểm hẹn nhận hàng ({pickupPoints.length})
            </h2>
            <button
              type="button"
              onClick={() => { setPointError(null); setPointModalOpen(true); }}
              className="btn-primary-sm"
            >
              <Plus size={14} /> Thêm điểm nhận
            </button>
          </div>

          <p className="text-xs text-muted mb-3">
            Các điểm hẹn cố định trong trường học để học sinh lựa chọn khi đặt
            đơn.
          </p>

          {pointsLoading ? <LoadingSpinner message="Đang tải điểm nhận hàng…" />
            : pointsError && pickupPoints.length === 0 ? <ErrorMessage error={pointsError} onRetry={refetchPoints} />
              : pickupPoints.length === 0 ? (
                <div className="pickup-points-empty">
                  <MapPin size={30} aria-hidden="true" />
                  <strong>Chưa có điểm nhận hàng</strong>
                  <p>Thêm địa điểm và chỉ dẫn để khách biết nơi đến nhận đơn.</p>
                </div>
              ) : null}
          <div className="pickup-points-list">
            {pickupPoints.map((pt) => (
              <div
                key={pt.id}
                className="pickup-point-item flex-between p-3 border rounded mb-2"
              >
                <div>
                  <strong>{pt.name}</strong>
                  {pt.instructions && (
                    <p className="text-xs text-muted">{pt.instructions}</p>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    disabled={pointMutations.updatePickupPoint.isPending}
                    aria-pressed={pt.active}
                    aria-busy={pointMutations.updatePickupPoint.isPending && pointMutations.updatePickupPoint.variables?.id === pt.id}
                    onClick={() => handleTogglePointActive(pt.id, pt.active)}
                    className={`btn-text-xs ${pt.active ? "text-green" : "text-gray"}`}
                  >
                    {pointMutations.updatePickupPoint.isPending && pointMutations.updatePickupPoint.variables?.id === pt.id
                      ? "Đang lưu…" : pt.active ? "Đang hoạt động" : "Tạm ẩn"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Pickup Point Modal */}
      <Modal
        isOpen={pointModalOpen}
        onClose={closePointModal}
        closeDisabled={pointSaving}
        className="pickup-point-dialog"
        title="Thêm điểm nhận hàng"
      >
        <form onSubmit={handleCreatePoint} className="pickup-point-form" noValidate aria-busy={pointSaving}>
          <p className="pickup-point-intro">Địa điểm này sẽ xuất hiện để khách chọn khi đặt hàng.</p>
          {pointError && <p id="pickup-point-error" className="pickup-point-error" role="alert">{pointError}</p>}
          <div className="form-group">
            <label className="form-label" htmlFor="pickup-point-name">Tên điểm nhận hàng <span aria-hidden="true">*</span></label>
            <input
              id="pickup-point-name"
              ref={pointNameRef}
              type="text"
              data-autofocus
              disabled={pointSaving}
              aria-invalid={!!pointError && !newPointName.trim()}
              aria-describedby={pointError ? "pickup-point-error" : "pickup-point-name-help"}
              value={newPointName}
              onChange={(e) => { setNewPointName(e.target.value); setPointError(null); }}
              placeholder="Ví dụ: Sảnh nhà B"
              className="input-field"
              required
            />
            <p id="pickup-point-name-help" className="pickup-point-help">Dùng tên ngắn gọn, dễ tìm trong trường.</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="pickup-point-instructions">
              Chỉ dẫn nhận hàng <span className="text-muted">(không bắt buộc)</span>
            </label>
            <textarea
              id="pickup-point-instructions"
              rows={3}
              disabled={pointSaving}
              value={newPointInstructions}
              onChange={(e) => setNewPointInstructions(e.target.value)}
              placeholder="Ví dụ: Gần ghế đá số 3, nhận vào giờ ra chơi."
              className="textarea-field"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={closePointModal}
              disabled={pointSaving}
              className="btn-secondary"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pointSaving}
              className="btn-primary"
            >
              {pointSaving && <LoaderCircle size={18} className="cart-loading-icon" aria-hidden="true" />}
              {pointSaving ? "Đang lưu…" : "Thêm điểm nhận"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
