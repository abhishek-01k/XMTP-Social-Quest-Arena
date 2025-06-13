import { useEffect, useState, useCallback, useRef } from "react";
import type { WebSocketMessage, QuestActionMessage } from "@/types/quest";

interface UseQuestWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export function useQuestWebSocket({
  url = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001",
  autoConnect = true,
  reconnectDelay = 3000,
  maxReconnectAttempts = 5,
  onMessage,
  onConnect,
  onDisconnect,
  onError,
}: UseQuestWebSocketOptions = {}) {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      setConnectionStatus("connecting");
      const websocket = new WebSocket(url);
      wsRef.current = websocket;

      websocket.onopen = () => {
        console.log("🔌 Connected to Quest Arena WebSocket");
        setConnectionStatus("connected");
        setReconnectAttempts(0);
        setWs(websocket);
        onConnect?.();
      };

      websocket.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          console.log("📨 WebSocket message received:", message);
          onMessage?.(message);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      websocket.onclose = () => {
        console.log("🔌 Quest Arena WebSocket disconnected");
        setConnectionStatus("disconnected");
        setWs(null);
        wsRef.current = null;
        onDisconnect?.();

        // Attempt to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          const attempts = reconnectAttempts + 1;
          setReconnectAttempts(attempts);
          console.log(`🔄 Attempting to reconnect (${attempts}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          setConnectionStatus("error");
          console.error("❌ Max reconnection attempts reached");
        }
      };

      websocket.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setConnectionStatus("error");
        onError?.(error);
      };
    } catch (error) {
      console.error("❌ Failed to create WebSocket connection:", error);
      setConnectionStatus("error");
    }
  }, [url, reconnectAttempts, maxReconnectAttempts, reconnectDelay, onMessage, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setWs(null);
    }
    
    setConnectionStatus("disconnected");
    setReconnectAttempts(0);
  }, []);

  const sendMessage = useCallback((message: QuestActionMessage | { type: string; data?: any }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error("❌ Cannot send message: WebSocket is not connected");
      return false;
    }

    try {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error("❌ Error sending WebSocket message:", error);
      return false;
    }
  }, []);

  const subscribe = useCallback((userInboxId: string) => {
    return sendMessage({
      type: "subscribe",
      data: { userInboxId }
    });
  }, [sendMessage]);

  const joinQuest = useCallback((questId: string, userInboxId: string, conversationId: string) => {
    return sendMessage({
      type: "questAction",
      data: {
        action: "joinQuest",
        questId,
        userInboxId,
        conversationId
      }
    });
  }, [sendMessage]);

  const leaveQuest = useCallback((questId: string, userInboxId: string) => {
    return sendMessage({
      type: "questAction",
      data: {
        action: "leaveQuest",
        questId,
        userInboxId
      }
    });
  }, [sendMessage]);

  const completeQuest = useCallback((questId: string, userInboxId: string, result?: any) => {
    return sendMessage({
      type: "questAction",
      data: {
        action: "completeQuest",
        questId,
        userInboxId,
        result
      }
    });
  }, [sendMessage]);

  const getUserStats = useCallback((userInboxId: string) => {
    return sendMessage({
      type: "questAction",
      data: {
        action: "getUserStats",
        userInboxId
      }
    });
  }, [sendMessage]);

  const getActiveQuests = useCallback(() => {
    return sendMessage({
      type: "questAction",
      data: {
        action: "getActiveQuests"
      }
    });
  }, [sendMessage]);

  const getQuestDetails = useCallback((questId: string) => {
    return sendMessage({
      type: "questAction",
      data: {
        action: "getQuestDetails",
        questId
      }
    });
  }, [sendMessage]);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, []);

  return {
    ws,
    connectionStatus,
    reconnectAttempts,
    connect,
    disconnect,
    sendMessage,
    subscribe,
    joinQuest,
    leaveQuest,
    completeQuest,
    getUserStats,
    getActiveQuests,
    getQuestDetails,
  };
}