import { useEffect, useRef, useState, useCallback } from "react";

export interface StreamEvent {
  id?: number;
  eventType: string;
  entityType: string;
  entityId?: number | null;
  description: string;
  metadata?: string | null;
  createdAt?: string;
}

export function useEventStream(entityTypes?: string[]) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectRef = useRef(0);

  const connect = useCallback(() => {
    const url = new URL("/api/events/stream", window.location.origin);
    if (entityTypes?.length) {
      url.searchParams.set("entityTypes", entityTypes.join(","));
    }

    const source = new EventSource(url.toString());

    source.onopen = () => {
      setConnected(true);
      setError(null);
      reconnectRef.current = 0;
    };

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StreamEvent;
        setEvents((prev) => [data, ...prev].slice(0, 200));
      } catch {
        // ignore malformed events
      }
    };

    source.onerror = () => {
      setConnected(false);
      setError("Event stream connection lost");
      source.close();

      // Reconnect with exponential backoff
      const delay = Math.min(1000 * 2 ** reconnectRef.current, 30_000);
      reconnectRef.current += 1;
      setTimeout(connect, delay);
    };

    return () => {
      source.close();
    };
  }, [entityTypes]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return { events, connected, error };
}
