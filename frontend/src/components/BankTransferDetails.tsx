import type { BankAccount } from "../types/api";
import { AssetImage } from "./AssetImage";

export function BankTransferDetails({ bank, amount, transferContent, qrSignedUrl, onRetry }: {
  bank: BankAccount;
  amount: number;
  transferContent?: string;
  qrSignedUrl?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="payment-instructions-panel">
      {qrSignedUrl && <div className="qr-container">
        <AssetImage src={qrSignedUrl} alt="Mã QR Chuyển khoản" className="qr-image" onRetry={onRetry} />
      </div>}
      <div className="bank-details-list text-sm">
        <div className="bank-detail-item"><span>Ngân hàng:</span><strong>{bank.bankName}</strong></div>
        <div className="bank-detail-item"><span>Số tài khoản:</span><strong className="text-primary">{bank.accountNumber}</strong></div>
        <div className="bank-detail-item"><span>Chủ tài khoản:</span><strong>{bank.accountHolder}</strong></div>
        <div className="bank-detail-item"><span>Số tiền cần chuyển:</span><strong className="text-red font-bold">{amount.toLocaleString("vi-VN")} đ</strong></div>
        {transferContent && <div className="bank-detail-item highlight-content">
          <span>Nội dung chuyển khoản (bắt buộc):</span><strong className="transfer-code">{transferContent}</strong>
        </div>}
      </div>
    </div>
  );
}
