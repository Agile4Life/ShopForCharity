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
  const contactPhone = shop.contact_phone?.trim();
  const contactEmail = shop.contact_email?.trim();
  const replyTo = contactEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ? contactEmail : null;
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
  if (contactPhone) fields.push(['Số điện thoại cửa hàng', contactPhone]);
  if (replyTo) fields.push(['Email hỗ trợ', replyTo]);
  const text = [
    `Xin chào ${order.buyer_name},`, '',
    `${shopName} đã xác nhận thành công đơn hàng ${order.order_code} của bạn.`, '',
    ...fields.map(([label, value]) => `${label}: ${value}`), '', 'Sản phẩm:',
    ...items.map(item => `- ${item.name_snapshot} × ${item.quantity} — ${money(item.unit_price)}/sản phẩm — ${money(item.line_total)}`),
    '', 'Vui lòng giữ mã đơn hàng và đến nhận hàng theo lịch đã xác nhận.',
    `Cảm ơn bạn đã ủng hộ ${shopName}!`,
  ].join('\n');
  const html = `<!doctype html><html lang="vi"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Đơn hàng ${escapeHtml(order.order_code)} đã được xác nhận</title>
    <style>@media only screen and (max-width:480px){.email-details th,.email-details td{display:block!important;width:auto!important}.email-details th{padding-bottom:0!important}.email-details td{padding-top:4px!important}}</style>
    </head><body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#222">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed"><tr><td align="center" style="padding:20px 12px">
    <div style="max-width:600px;margin:0 auto">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-collapse:collapse;table-layout:fixed"><tr><td style="padding:24px 20px;border-top:4px solid #166534;overflow-wrap:anywhere;word-break:break-word">
      <p style="margin:0 0 12px;font-weight:bold;color:#166534;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(shopName)}</p>
      <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#166534">Đơn hàng đã được xác nhận</h1>
      <p>Xin chào ${escapeHtml(order.buyer_name)},</p>
      <p>Chúng tôi đã xác nhận thành công đơn hàng <strong style="overflow-wrap:anywhere;word-break:break-word">${escapeHtml(order.order_code)}</strong> của bạn.</p>
      <table class="email-details" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed">${fields.map(([label, value]) =>
        `<tr><th scope="row" width="42%" style="text-align:left;padding:8px 8px 8px 0;vertical-align:top;font-weight:normal;color:#555">${escapeHtml(label)}</th><td style="padding:8px 0;vertical-align:top;white-space:pre-line;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</td></tr>`).join('')}</table>
      <h2 style="margin:24px 0 8px;font-size:18px">Sản phẩm</h2>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;table-layout:fixed">
        <thead><tr><th scope="col" style="text-align:left;padding:8px 8px 8px 0;border-bottom:1px solid #ddd">Sản phẩm</th><th scope="col" width="38%" style="text-align:right;padding:8px 0;border-bottom:1px solid #ddd">Thành tiền</th></tr></thead>
        <tbody>${items.map(item => `<tr><td style="padding:12px 8px 12px 0;vertical-align:top;border-bottom:1px solid #eee;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(item.name_snapshot)}<br><span style="font-size:14px;color:#555">Số lượng: ${escapeHtml(item.quantity)}<br>Đơn giá: ${money(item.unit_price)}</span></td><td style="padding:12px 0;text-align:right;vertical-align:top;border-bottom:1px solid #eee;overflow-wrap:anywhere;word-break:break-word">${money(item.line_total)}</td></tr>`).join('')}</tbody>
      </table>
      <p style="margin:20px 0;padding:12px;background:#f0f5ef">Vui lòng giữ mã đơn hàng và đến nhận hàng theo lịch đã xác nhận.</p>
      <p style="margin:0">Cảm ơn bạn đã ủng hộ ${escapeHtml(shopName)}!</p>
    </td></tr></table></div></td></tr></table></body></html>`;
  return {
    to: [order.buyer_email.trim()],
    subject: `Đơn hàng ${order.order_code} đã được xác nhận thành công`.replace(/[\r\n]/g, ' '),
    text, html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };
}
