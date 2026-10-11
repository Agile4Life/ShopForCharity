const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(value));
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const paymentLabels = {
  UNPAID: 'Chưa thanh toán', REPORTED: 'Đã báo chuyển khoản, đang chờ đối soát',
  PAID: 'Đã thanh toán', REFUND_PENDING: 'Đang chờ hoàn tiền', REFUNDED: 'Đã hoàn tiền',
};

export function orderConfirmationEmail(order, items, shop) {
  const shopName = shop.name;
  const pickupAt = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date(order.confirmed_at));
  const fields = [
    ['Mã đơn hàng', order.order_code],
    ['Khách hàng', order.buyer_name],
    ['Trạng thái đơn hàng', 'Đã xác nhận thành công'],
    ['Tổng tiền', money(order.total)],
    ['Phương thức thanh toán', order.payment_method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản QR'],
    ['Trạng thái thanh toán', paymentLabels[order.payment_status] || order.payment_status],
    ['Điểm nhận hàng', order.pickup_name],
    ['Thời gian nhận hàng (giờ Việt Nam)', pickupAt],
  ];
  if (order.pickup_instructions) fields.push(['Hướng dẫn nhận hàng', order.pickup_instructions]);
  if (shop.contact_phone) fields.push(['Liên hệ cửa hàng', shop.contact_phone]);
  const text = [
    `Xin chào ${order.buyer_name},`, '',
    `${shopName} đã xác nhận thành công đơn hàng ${order.order_code} của bạn.`, '',
    ...fields.map(([label, value]) => `${label}: ${value}`), '', 'Sản phẩm:',
    ...items.map(item => `- ${item.name_snapshot} × ${item.quantity} — ${money(item.unit_price)}/sản phẩm — ${money(item.line_total)}`),
    '', 'Vui lòng giữ mã đơn hàng và đến nhận hàng theo lịch đã xác nhận.',
    `Cảm ơn bạn đã ủng hộ ${shopName}!`,
  ].join('\n');
  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#222">
    <main style="max-width:600px;margin:24px auto;padding:24px;background:#fff;border-radius:12px">
      <p>${escapeHtml(shopName)}</p><h1 style="font-size:24px;color:#166534">Đơn hàng đã được xác nhận</h1>
      <p>Xin chào ${escapeHtml(order.buyer_name)},</p>
      <p>Chúng tôi đã xác nhận thành công đơn hàng <strong>${escapeHtml(order.order_code)}</strong> của bạn.</p>
      <table style="width:100%;border-collapse:collapse">${fields.map(([label, value]) =>
        `<tr><th scope="row" style="text-align:left;padding:8px;vertical-align:top">${escapeHtml(label)}</th><td style="padding:8px;white-space:pre-line">${escapeHtml(value)}</td></tr>`).join('')}</table>
      <h2 style="font-size:18px">Sản phẩm</h2><table style="width:100%;border-collapse:collapse">
        <thead><tr><th scope="col" style="text-align:left">Sản phẩm</th><th scope="col">SL</th><th scope="col">Đơn giá</th><th scope="col">Thành tiền</th></tr></thead>
        <tbody>${items.map(item => `<tr><td style="padding:10px 0">${escapeHtml(item.name_snapshot)}</td><td style="text-align:center">${item.quantity}</td><td style="text-align:right">${money(item.unit_price)}</td><td style="text-align:right">${money(item.line_total)}</td></tr>`).join('')}</tbody>
      </table><p>Vui lòng giữ mã đơn hàng và đến nhận hàng theo lịch đã xác nhận.</p>
      <p>Cảm ơn bạn đã ủng hộ ${escapeHtml(shopName)}!</p>
    </main></body></html>`;
  return {
    to: [order.buyer_email.trim()],
    subject: `Đơn hàng ${order.order_code} đã được xác nhận thành công`.replace(/[\r\n]/g, ' '),
    text, html,
    ...(shop.contact_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shop.contact_email) ? { reply_to: shop.contact_email } : {}),
  };
}
