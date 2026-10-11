import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/auth-context';
import type { RealtimeChannel } from '@supabase/supabase-js';

const removals = new Map<string, Promise<unknown>>();
const refreshes = new WeakMap<QueryClient, { dirty: boolean; task: Promise<void> }>();

// Inbox and room receive the same database event. Serialize their refreshes so
// cancelled HTTP requests cannot pile up, and fetch again if an event arrives
// while an older snapshot is still loading.
export function refreshChat(queryClient: QueryClient): Promise<void> {
  const pending = refreshes.get(queryClient);
  if (pending) { pending.dirty = true; return pending.task; }
  const refresh = { dirty: true, task: Promise.resolve() };
  refreshes.set(queryClient, refresh);
  refresh.task = (async () => {
    try {
      do {
        refresh.dirty = false;
        await queryClient.invalidateQueries({ queryKey: ['chat'] }, { cancelRefetch: false });
      } while (refresh.dirty);
    } finally { refreshes.delete(queryClient); }
  })();
  return refresh.task;
}

export function useChatRealtime(topic: string | null) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!topic || !session?.access_token) return;
    let alive = true;
    let channel: RealtimeChannel | undefined;
    let refreshTimer: number | undefined;
    const invalidate = () => {
      if (!alive || refreshTimer !== undefined) return;
      if (document.visibilityState !== 'visible') {
        void refreshChat(queryClient);
        return;
      }
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        if (alive) void refreshChat(queryClient);
      }, 100);
    };
    // Access tokens refresh during a long conversation; rejoin with fresh auth.
    void supabase.realtime.setAuth(session.access_token).then(async () => {
      await removals.get(topic);
      if (!alive) return;
      // Do not create a channel until this effect is still mounted. Otherwise
      // StrictMode can reuse a channel whose asynchronous teardown is pending.
      channel = supabase.channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, invalidate);
      channel.subscribe(status => {
        if (!alive) return;
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') invalidate();
      });
    }).catch(() => { if (alive) setConnected(false); });
    return () => {
      alive = false; clearTimeout(refreshTimer); setConnected(false);
      if (channel) {
        const removal = supabase.removeChannel(channel).catch(() => undefined);
        removals.set(topic, removal);
        void removal.finally(() => { if (removals.get(topic) === removal) removals.delete(topic); });
      }
    };
  }, [topic, session?.access_token, queryClient]);
  return connected;
}
