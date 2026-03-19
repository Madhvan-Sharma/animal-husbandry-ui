"use client";

import { useEffect, useState } from "react";
import { Bell, FileText, MessageSquare, Pill, CalendarCheck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getUserId } from "@/lib/user-id";
import { cn } from "@/lib/utils";
import { useQueryState, parseAsBoolean } from "nuqs";

type Notification = {
  _id: string;
  ticketId?: string;
  type: string;
  title: string;
  body?: string;
  read?: boolean;
  createdAt: string;
};

function getActionForType(type: string): { label: string; icon: React.ReactNode } | null {
  switch (type) {
    case "doc_request":
      return { label: "View ticket & upload document", icon: <FileText className="size-4" /> };
    case "vet_message":
      return { label: "View ticket & reply", icon: <MessageSquare className="size-4" /> };
    case "medicine_recommendation":
      return { label: "View recommendation", icon: <Pill className="size-4" /> };
    case "appointment_scheduled":
      return { label: "View appointment", icon: <CalendarCheck className="size-4" /> };
    case "dispatch_ambulance":
    case "dispatch_vet_team":
    case "dispatch_ai_team":
      return { label: "View ticket & reply", icon: <MessageSquare className="size-4" /> };
    default:
      return { label: "View ticket", icon: <ChevronRight className="size-4" /> };
  }
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setSidebarOpen] = useQueryState("sidebarOpen", parseAsBoolean.withDefault(false));
  const [, setOpenTicketId] = useQueryState("openTicketId");

  const userId = typeof window !== "undefined" ? getUserId() : "";
  const unread = list.filter((n) => !n.read);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`)
      .then((r) => r.json())
      .then((data) => (Array.isArray(data) ? data : []))
      .then(setList)
      .finally(() => setLoading(false));
  }, [userId, open]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    setList((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
  }

  function handleAction() {
    setSidebarOpen(true);
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen(true)}
        aria-label="Notifications"
      >
        <Bell className="size-5" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">
          <div className="shrink-0 border-b border-border px-6 py-4 pr-12">
            <SheetHeader className="p-0">
              <SheetTitle className="text-lg font-semibold">Notifications</SheetTitle>
              {unread.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">{unread.length} unread</p>
              )}
            </SheetHeader>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent mb-4" />
                <p className="text-sm font-medium text-foreground">Loading notifications</p>
                <p className="text-xs text-muted-foreground mt-1">Please wait…</p>
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 rounded-xl border border-dashed border-border bg-muted/20">
                <Bell className="size-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground">No notifications</p>
                <p className="text-xs text-muted-foreground mt-1">You’re all caught up.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {list.map((n) => {
                  const action = getActionForType(n.type);
                  const hasDoctorAsk = [
                    "doc_request",
                    "vet_message",
                    "medicine_recommendation",
                    "appointment_scheduled",
                    "dispatch_ambulance",
                    "dispatch_vet_team",
                    "dispatch_ai_team",
                  ].includes(n.type);
                  return (
                    <li
                      key={n._id}
                      className={cn(
                        "rounded-xl border transition-colors overflow-hidden",
                        !n.read ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                      )}
                    >
                      <div className="p-4">
                        <p className="font-semibold text-foreground">{n.title}</p>
                        {n.body && <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">{n.body}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {hasDoctorAsk && action && (
                            <Button
                              size="sm"
                              variant={!n.read ? "default" : "outline"}
                              className="gap-1.5"
                              onClick={() => {
                                if (n.ticketId) {
                                  setOpenTicketId(n.ticketId);
                                }
                                handleAction();
                                if (!n.read) markRead(n._id);
                              }}
                            >
                              {action.icon}
                              {action.label}
                            </Button>
                          )}
                          {!n.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => markRead(n._id)}
                            >
                              Mark read
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
