import { notifyError as notify } from "../../components/Usability";
import React, { useState, useEffect } from "react";
import {
  Settings,
  CreditCard,
  QrCode,
  MapPin,
  Plus,
  Upload,
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

export const SellerSettingsPage: React.FC = () => {
  const { data: settings, isLoading, error, refetch } = useSellerShopSettings();
  const updateSettingsMutation = useUpdateShopSettings();

  const { data: pickupPoints = [] } = useSellerPickupPoints();
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
      notify(err.message || "Lỗi khi tải ảnh QR lên");
    } finally {
      setUploadingQr(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
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
      notify(err.message || "Lỗi lưu cài đặt");
    }
  };

  const handleCreatePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPointName.trim()) return;

    try {
      await pointMutations.createPickupPoint.mutateAsync({
        name: newPointName.trim(),
        instructions: newPointInstructions.trim(),
        active: true,
      });
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Chưa lưu được thay đổi. Thử lại sau.",
      );
      return;
    }
    setPointModalOpen(false);
    setNewPointName("");
    setNewPointInstructions("");
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
      notify(
        error instanceof Error
          ? error.message
          : "Chưa lưu được thay đổi. Thử lại sau.",
      );
      return;
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Đang tải thông tin cấu hình shop..." />;
  }

  if (error) {
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
              <div className="flex items-center gap-4">
                <div className="qr-preview-box">
                  {qrUrl ? (
                    <img src={qrUrl} alt="Mã QR" className="qr-preview-img" />
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
              disabled={updateSettingsMutation.isPending}
              className="btn-primary full-width mt-4"
            >
              {updateSettingsMutation.isPending
                ? "Đang lưu..."
                : "Lưu toàn bộ cài đặt"}
            </button>
          </form>
        </div>

        {/* Pickup Points Management */}
        <div className="card">
          <div className="flex-between mb-3">
            <h2 className="section-subtitle flex items-center gap-2">
              <MapPin size={18} /> Điểm hẹn nhận hàng ({pickupPoints.length})
            </h2>
            <button
              type="button"
              onClick={() => setPointModalOpen(true)}
              className="btn-primary-sm"
            >
              <Plus size={14} /> Thêm điểm nhận
            </button>
          </div>

          <p className="text-xs text-muted mb-3">
            Các điểm hẹn cố định trong trường học để học sinh lựa chọn khi đặt
            đơn.
          </p>

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
                    onClick={() => handleTogglePointActive(pt.id, pt.active)}
                    className={`btn-text-xs ${pt.active ? "text-green" : "text-gray"}`}
                  >
                    {pt.active ? "Đang hoạt động" : "Tạm ẩn"}
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
        onClose={() => setPointModalOpen(false)}
        title="Thêm điểm hẹn nhận hàng mới"
      >
        <form onSubmit={handleCreatePoint}>
          <div className="form-group">
            <label className="form-label">Tên địa điểm nhận hàng *:</label>
            <input
              id="sellersettingspage-field-7"
              type="text"
              value={newPointName}
              onChange={(e) => setNewPointName(e.target.value)}
              placeholder="Ví dụ: Cổng Thư viện trường / Sảnh nhà B"
              className="input-field"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="sellersettingspage-field-8">
              Chỉ dẫn nhận hàng:
            </label>
            <textarea
              id="sellersettingspage-field-8"
              rows={2}
              value={newPointInstructions}
              onChange={(e) => setNewPointInstructions(e.target.value)}
              placeholder="Ví dụ: Đứng gần ghế đá số 3, nhận vào giờ ra chơi..."
              className="textarea-field"
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={() => setPointModalOpen(false)}
              className="btn-secondary"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={pointMutations.createPickupPoint.isPending}
              className="btn-primary"
            >
              Thêm điểm nhận
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
