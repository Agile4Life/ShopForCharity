import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ShoppingBag, X } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { OrderCode } from '../../components/OrderCode';
import { POLL_INTERVAL_ORDERS } from '../../lib/query-client';
import { getUnreadOrderNotifications, useMarkNotificationRead } from './api';
import { useSellerNotificationsRealtime } from './notifications-realtime';
import type { NotificationItem } from '../../types/api';
import './seller-notifications.css';

export function SellerOrderNotifications() {
  const { isSeller, isLoading, profile, user, profileError } = useAuth();
  if (isLoading || profileError || !isSeller || !profile?.active || profile.authUserId !== user?.id) return null;
  // Switching accounts or logging out disposes the queue and subscription.
  return <OrderNotificationQueue key={profile.id} profileId={profile.id} />;
}

function OrderNotificationQueue({ profileId }: { profileId: string }) {
  const queryClient = useQueryClient();
  const { data: notifications } = useQuery({
    queryKey: ['seller-notifications', profileId, 'new-orders'],
    queryFn: ({ signal }) => getUnreadOrderNotifications(signal),
    refetchInterval: POLL_INTERVAL_ORDERS,
    staleTime: 0,
  });
  const markRead = useMarkNotificationRead();
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  useSellerNotificationsRealtime(profileId);

  useEffect(() => {
    if (!notifications) return;
    if (!seen.current) {
      // The first successful snapshot is the baseline; old unread orders remain
      // on the dashboard without being announced as newly placed orders.
      seen.current = new Set(notifications.map(notification => notification.id));
      return;
    }
    const fresh: NotificationItem[] = [];
    for (const notification of notifications) {
      if (!seen.current.has(notification.id) && !notification.isRead && notification.type === 'ORDER_CREATED' && notification.orderId) {
        fresh.push(notification);
      }
      seen.current.add(notification.id);
    }
    const unread = new Set(notifications.filter(notification => !notification.isRead).map(notification => notification.id));
    setQueue(previous => [...previous.filter(notification => unread.has(notification.id)), ...fresh.reverse()]);
    if (fresh.length) {
      // The fallback poll also updates whichever seller page is currently open.
      void Promise.all(['seller-orders', 'seller-dashboard'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    }
  }, [notifications, queryClient]);

  const dismiss = (id: string) => setQueue(previous => previous.filter(notification => notification.id !== id));

  return <aside className="seller-order-alerts" aria-label="Thông báo đơn hàng mới" aria-live="polite" aria-relevant="additions">
    {queue.slice(0, 3).map(notification => <article className="seller-order-alert" key={notification.id}>
      <span className="seller-order-alert-icon"><ShoppingBag size={22} aria-hidden="true" /></span>
      <div className="seller-order-alert-content">
        <strong>Có đơn hàng mới!</strong>
        {notification.orderCode && <span className="seller-order-alert-code"><OrderCode value={notification.orderCode} /></span>}
        <p>{notification.buyerName || 'Khách hàng vừa đặt đơn'}{notification.orderTotal != null ? ` · ${notification.orderTotal.toLocaleString('vi-VN')} đ` : ''}</p>
        <Link className="seller-order-alert-action" to={`/seller/orders/${notification.orderId}`} onClick={() => {
          dismiss(notification.id);
          // Navigation must remain immediate even if marking read fails.
          markRead.mutate(notification.id);
        }}>Xử lý đơn <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
      <button className="seller-order-alert-close" type="button" aria-label="Đóng thông báo đơn hàng" onClick={() => dismiss(notification.id)}>
        <X size={18} aria-hidden="true" />
      </button>
    </article>)}
    {queue.length > 3 && <p className="seller-order-alert-overflow">Còn {queue.length - 3} đơn hàng mới đang chờ thông báo.</p>}
  </aside>;
}
