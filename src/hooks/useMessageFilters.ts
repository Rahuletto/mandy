import { useState, useMemo } from "react";
import type { WebSocketMessage } from "../types/project";

export type MessageFilter = "all" | "sent" | "received";

export function useMessageFilters(messages: WebSocketMessage[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<MessageFilter>("all");

  const cycleFilter = () =>
    setFilter((f) => (f === "all" ? "sent" : f === "sent" ? "received" : "all"));

  const filteredMessages = useMemo(() => {
    let msgs = messages;

    if (filter === "sent") {
      msgs = msgs.filter((m) => m.direction === "send");
    } else if (filter === "received") {
      msgs = msgs.filter(
        (m) => m.direction === "receive" || m.direction === "system",
      );
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      msgs = msgs.filter((m) => m.data.toLowerCase().includes(q));
    }

    return msgs;
  }, [messages, filter, searchQuery]);

  return { searchQuery, setSearchQuery, filter, cycleFilter, filteredMessages };
}
