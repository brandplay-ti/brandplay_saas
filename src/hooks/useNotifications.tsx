import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Notification {
  id: string;
  category: string;
  priority: "alta" | "media" | "baixa";
  title: string;
  description: string | null;
  action_url: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const unread = notifications.filter((n) => !n.read_at).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [user, fetchNotifications]);

  const markAsRead = async (id: string) => {
    const readAt = new Date().toISOString();
    await supabase.from("notifications").update({ read_at: readAt }).eq("id", id);
    setNotifications((prev) => prev.map((notification) => notification.id === id ? { ...notification, read_at: readAt } : notification));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    setNotifications((prev) => prev.map((notification) => notification.read_at ? notification : { ...notification, read_at: new Date().toISOString() }));
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  };

  const checkNow = async () => {
    setLoading(true);
    const { error } = await supabase.functions.invoke("check-notifications", { body: {} });
    if (error) console.error(error);
    await fetchNotifications();
    setLoading(false);
  };

  return { notifications, unread, loading, markAsRead, markAllRead, remove, refetch: fetchNotifications, checkNow };
}
