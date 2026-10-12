import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/auth-context';

const removals = new Map<string, Promise<unknown>>();
const refreshes = new WeakMap<QueryClient, { dirty: boolean; task: Promise<void> }>();

export function refreshSellerNotifications(queryClient: QueryClient): Promise<void> {
  const pending = refreshes.get(queryClient);
  if (pending) { pending.dirty = true; return pending.task; }
  const refresh = { dirty: true, task: Promise.resolve() };
  refreshes.set(queryClient, refresh);
  refresh.task = (async () => {
    try {
      do {
        refresh.dirty = false;
        await Promise.all(['seller-notifications', 'seller-orders', 'seller-order', 'seller-dashboard'].map(key =>
          queryClient.invalidateQueries({ queryKey: [key] }, { cancelRefetch: false })));
      } while (refresh.dirty);
    } finally { refreshes.delete(queryClient); }
  })();
  return refresh.task;
}

export function useSellerNotificationsRealtime(profileId: string) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!session?.access_token) return;
    const topic = `seller:notifications:${profileId}`;
    let alive = true;
    let channel: RealtimeChannel | undefined;
    let timer: number | undefined;
    const refresh = () => {
      if (!alive || timer !== undefined) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (alive) void refreshSellerNotifications(queryClient).catch(() => undefined);
      }, 100);
    };
    void supabase.realtime.setAuth(session.access_token).then(async () => {
      await removals.get(topic);
      if (!alive) return;
      channel = supabase.channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, refresh);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') refresh(); // Also recover events missed during reconnection.
      });
    }).catch(() => undefined); // Polling and refetch-on-focus remain available.
    return () => {
      alive = false;
      window.clearTimeout(timer);
      if (channel) {
        const removal = supabase.removeChannel(channel).catch(() => undefined);
        removals.set(topic, removal);
        void removal.finally(() => { if (removals.get(topic) === removal) removals.delete(topic); });
      }
    };
  }, [profileId, session?.access_token, queryClient]);
}
