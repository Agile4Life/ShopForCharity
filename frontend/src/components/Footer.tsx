import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer-wrapper">
      <div className="footer-container">
        <div className="footer-info">
          <h4>Website Bán Hàng Học Đường - School Shop</h4>
          <p>
            Đồ ăn vặt, quà lưu niệm học đường. Đặt đơn online, nhận hàng trực tiếp tại các điểm hẹn trong trường.
          </p>
        </div>
        <div className="footer-notice">
          <p className="notice-text">
            Thanh toán tiền mặt hoặc chuyển khoản QR an toàn sau khi người bán xác nhận đơn.
          </p>
          <p className="copyright">© 2026 School Shop. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
