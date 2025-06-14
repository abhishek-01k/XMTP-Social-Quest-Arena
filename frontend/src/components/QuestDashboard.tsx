"use client";

import { useEffect, useState, useCallback } from "react";
import { useXMTP } from "@/context/xmtp-context";

interface Quest {
  id: string;
  type: "social_challenge" | "knowledge_quest" | "creative_contest" | "community_building" | "cross_protocol";
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  duration: number;
  participantLimits: {
    min: number;
    max: number;
  };
  rewards: {
    xp: number;
    tokens?: number;
    badges?: string[];
  };
  requirements: string[];
  miniAppConfig: {
    type: "dashboard" | "game" | "poll" | "leaderboard" | "gallery";
    config: {
      theme: string;
      features: string[];
    };
  };
  conversationId: string;
  status: "active" | "completed" | "expired";
  participants: string[];
  createdAt: string;
  expiresAt: string;
}

interface UserStats {
  level: number;
  xp: number;
  questsCompleted: number;
  socialScore: number;
  lastActive: string;
}

interface QuestMaster {
  name: string;
  description: string;
  questTypes: string[];
  style: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
const API_SECRET = process.env.NEXT_PUBLIC_API_SECRET || "your-secret-key";

export default function QuestDashboard() {
  const { client } = useXMTP();
  const [activeQuests, setActiveQuests] = useState<Quest[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [questMasters] = useState<QuestMaster[]>([
    {
      name: "The Mentor",
      description: "Guides users through skill development and learning",
      questTypes: ["knowledge_quest", "community_building"],
      style: "encouraging"
    },
    {
      name: "The Competitor",
      description: "Creates competitive challenges and tournaments",
      questTypes: ["social_challenge", "knowledge_quest"],
      style: "competitive"
    },
    {
      name: "The Creator",
      description: "Fosters artistic and creative expression",
      questTypes: ["creative_contest", "community_building"],
      style: "creative"
    },
    {
      name: "The Connector",
      description: "Facilitates networking and relationship building",
      questTypes: ["social_challenge", "community_building"],
      style: "analytical"
    },
    {
      name: "The Explorer",
      description: "Introduces users to new protocols and technologies",
      questTypes: ["cross_protocol", "knowledge_quest"],
      style: "adventurous"
    }
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");

  // API helper function
  const apiCall = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": API_SECRET,
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call to ${endpoint} failed:`, error);
      throw error;
    }
  }, []);

  // WebSocket connection with reconnection logic
  useEffect(() => {
    if (!client) return;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connectWebSocket = () => {
      setConnectionStatus("connecting");
      const websocket = new WebSocket(WS_URL);
      
      websocket.onopen = () => {
        console.log("🔌 Connected to Quest Arena WebSocket");
        setConnectionStatus("connected");
        reconnectAttempts = 0;
        websocket.send(JSON.stringify({ 
          type: "subscribe",
          data: { userInboxId: client.inboxId }
        }));
      };

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("📨 Quest update received:", message);
          
          switch (message.type) {
            case "subscribed":
              console.log("✅ Subscribed to Quest Arena updates");
              break;
            case "questCreated":
              setActiveQuests(prev => {
                const exists = prev.some(q => q.id === message.data.quest.id);
                return exists ? prev : [...prev, message.data.quest];
              });
              console.log("🎯 New quest available!");
              break;
            case "questCompleted":
              setActiveQuests(prev => 
                prev.filter(quest => quest.id !== message.data.questId)
              );
              // Refresh user stats after quest completion
              void fetchUserStats();
              break;
            case "userStats":
              setUserStats(message.data);
              break;
            case "error":
              setError(message.data);
              break;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      websocket.onclose = () => {
        console.log("🔌 Quest Arena WebSocket disconnected");
        setConnectionStatus("disconnected");
        
        // Attempt to reconnect
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`🔄 Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
          setTimeout(connectWebSocket, reconnectDelay);
        } else {
          console.error("❌ Max reconnection attempts reached");
          setError("Connection lost. Please refresh the page.");
        }
      };

      websocket.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setConnectionStatus("disconnected");
      };

      setWs(websocket);
    };

    connectWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [client]);

  // Fetch user stats
  const fetchUserStats = useCallback(async () => {
    if (!client) return;

    try {
      const stats = await apiCall(`/api/quests/user/${client.inboxId}/stats`);
      setUserStats(stats);
    } catch (error) {
      console.error("Error fetching user stats:", error);
      // Set default stats if API fails
      setUserStats({
        level: 1,
        xp: 0,
        questsCompleted: 0,
        socialScore: 0,
        lastActive: new Date().toISOString()
      });
    }
  }, [client, apiCall]);

  // Fetch active quests
  const fetchActiveQuests = useCallback(async () => {
    try {
      const quests = await apiCall("/api/quests/active");
      setActiveQuests(quests);
    } catch (error) {
      console.error("Error fetching active quests:", error);
      setActiveQuests([]);
    }
  }, [apiCall]);

  // Initial data fetch
  useEffect(() => {
    if (!client) return;

    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        await Promise.all([
          fetchUserStats(),
          fetchActiveQuests()
        ]);
        
      } catch (error) {
        console.error("Error fetching initial quest data:", error);
        setError("Failed to load quest data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [client, fetchUserStats, fetchActiveQuests]);

  // Join quest action
  const joinQuest = useCallback((quest: Quest) => {
    if (!ws || !client || !client.inboxId) {
      setError("Not connected to quest system");
      return;
    }

    // Check if user meets requirements
    if (quest.requirements.length > 0) {
      // Could add requirement validation here
      console.log("Quest requirements:", quest.requirements);
    }

    ws.send(JSON.stringify({
      type: "questAction",
      data: {
        action: "joinQuest",
        questId: quest.id,
        userInboxId: client.inboxId,
        conversationId: quest.conversationId
      },
    }));

    // Update local state optimistically
    setActiveQuests(prev => 
      prev.map(q => 
        q.id === quest.id && client.inboxId
          ? { ...q, participants: [...q.participants, client.inboxId] }
          : q
      )
    );

    console.log("🎮 Joined quest:", quest.title);
  }, [ws, client]);

  // Trigger manual quest creation (for testing)
  const triggerQuest = useCallback(async () => {
    if (!client || !client.inboxId) return;

    try {
      // Get current group ID from XMTP context or API
      const groupInfo = await apiCall(`/api/xmtp/get-group-id?inboxId=${client.inboxId}`);
      
      if (groupInfo.groupId) {
        await apiCall("/api/quests/trigger", {
          method: "POST",
          body: JSON.stringify({ conversationId: groupInfo.groupId })
        });
      }
    } catch (error) {
      console.error("Error triggering quest:", error);
      setError("Failed to trigger quest creation");
    }
  }, [client, apiCall]);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "text-green-400 border-green-400";
      case "medium": return "text-yellow-400 border-yellow-400";
      case "hard": return "text-orange-400 border-orange-400";
      case "expert": return "text-red-400 border-red-400";
      default: return "text-gray-400 border-gray-400";
    }
  };

  const getQuestTypeIcon = (type: string) => {
    switch (type) {
      case "social_challenge": return "👥";
      case "knowledge_quest": return "🧠";
      case "creative_contest": return "🎨";
      case "community_building": return "🏗️";
      case "cross_protocol": return "🌐";
      default: return "🎯";
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected": return "text-green-400";
      case "connecting": return "text-yellow-400";
      case "disconnected": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  if (!client) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-700 text-center">
        <div className="text-4xl mb-4">🔐</div>
        <h3 className="text-lg font-bold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400">Connect your wallet to access the Quest Arena and start earning rewards!</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
          <div className="space-y-2">
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-20 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Quest Arena Status:</span>
        <span className={`font-medium ${getConnectionStatusColor()}`}>
          {connectionStatus === "connected" && "🟢 Connected"}
          {connectionStatus === "connecting" && "🟡 Connecting..."}
          {connectionStatus === "disconnected" && "🔴 Disconnected"}
        </span>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-red-400">⚠️</span>
            <span className="text-red-200 text-sm">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-blue-900 to-indigo-900 rounded-lg p-4 border border-purple-500">
        <h2 className="text-xl font-bold text-white mb-2">🎮 XMTP Social Quest Arena</h2>
        <p className="text-purple-200 text-sm mb-3">
          AI Quest Masters analyze your group conversations and create personalized challenges. 
          Complete quests to earn XP, tokens, and unlock achievements!
        </p>
      </div>

      {/* User Stats */}
      {userStats && (
        <div className="bg-gradient-to-r from-purple-900 to-blue-900 rounded-lg p-4 border border-purple-500">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white">🏆 Your Quest Profile</h3>
            <button
              onClick={fetchUserStats}
              className="text-xs text-purple-300 hover:text-purple-200"
            >
              🔄 Refresh
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-purple-800/30 rounded p-2">
              <div className="text-gray-300">Level</div>
              <div className="text-yellow-400 font-bold text-lg">{userStats.level}</div>
            </div>
            <div className="bg-blue-800/30 rounded p-2">
              <div className="text-gray-300">XP</div>
              <div className="text-blue-400 font-bold text-lg">{userStats.xp}</div>
            </div>
            <div className="bg-green-800/30 rounded p-2">
              <div className="text-gray-300">Completed</div>
              <div className="text-green-400 font-bold text-lg">{userStats.questsCompleted}</div>
            </div>
            <div className="bg-pink-800/30 rounded p-2">
              <div className="text-gray-300">Social Score</div>
              <div className="text-pink-400 font-bold text-lg">{userStats.socialScore}</div>
            </div>
          </div>
        </div>
      )}

      {/* Quest Masters */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-2">🤖 AI Quest Masters</h3>
        <p className="text-gray-400 text-xs mb-3">
          Each Quest Master has a unique personality and creates different types of challenges
        </p>
        <div className="grid grid-cols-1 gap-2">
          {questMasters.map((master) => (
            <div
              key={master.name}
              className="bg-gray-800 rounded p-2 border border-gray-600 hover:border-purple-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white text-sm">{master.name}</div>
                  <div className="text-gray-400 text-xs">{master.description}</div>
                </div>
                <div className="text-xs text-gray-500">
                  {master.style}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active Quests */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-white">🎯 Active Quests</h3>
          <div className="flex gap-2">
            <button
              onClick={fetchActiveQuests}
              className="text-xs text-gray-400 hover:text-gray-300"
            >
              🔄 Refresh
            </button>
            <button
              onClick={triggerQuest}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-2 py-1 rounded"
            >
              ⚡ Trigger Quest
            </button>
          </div>
        </div>
        
        {activeQuests.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">💬</div>
            <p className="text-gray-400 mb-2">No active quests yet!</p>
            <p className="text-gray-500 text-sm mb-4">
              Start chatting in the group to trigger new challenges from our AI Quest Masters
            </p>
            <button
              onClick={triggerQuest}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
            >
              🎯 Create Test Quest
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {activeQuests.map((quest) => {
              const isParticipant = client.inboxId ? quest.participants.includes(client.inboxId) : false;
              const timeRemaining = new Date(quest.expiresAt).getTime() - Date.now();
              const hoursRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60)));
              const minutesRemaining = Math.max(0, Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60)));
              
              return (
                <div
                  key={quest.id}
                  className={`bg-gray-800 rounded-lg p-4 border transition-all ${
                    isParticipant 
                      ? "border-purple-500 bg-purple-900/20" 
                      : "border-gray-600 hover:border-purple-500"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getQuestTypeIcon(quest.type)}</span>
                      <div>
                        <h4 className="font-semibold text-white">{quest.title}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-1 rounded border ${getDifficultyColor(quest.difficulty)}`}>
                            {quest.difficulty.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-400">
                            {quest.miniAppConfig.type}
                          </span>
                        </div>
                      </div>
                    </div>
                    {timeRemaining > 0 && (
                      <div className="text-xs text-gray-400 text-right">
                        <div>⏰ {hoursRemaining}h {minutesRemaining}m</div>
                        <div>left</div>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-gray-300 text-sm mb-3">{quest.description}</p>
                  
                  {quest.requirements.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs text-gray-400 mb-1">Requirements:</div>
                      <div className="flex flex-wrap gap-1">
                        {quest.requirements.map((req, index) => (
                          <span key={index} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                            {req}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                    <span>⏱️ {quest.duration}min</span>
                    <span>👥 {quest.participantLimits.min}-{quest.participantLimits.max}</span>
                    <span>⭐ {quest.rewards.xp} XP</span>
                    {quest.rewards.tokens && <span>🪙 {quest.rewards.tokens}</span>}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {quest.participants.length} joined
                      {isParticipant && " • You're participating!"}
                    </span>
                    {!isParticipant && timeRemaining > 0 && (
                      <button
                        onClick={() => joinQuest(quest)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-full transition-colors"
                      >
                        Join Quest
                      </button>
                    )}
                    {isParticipant && (
                      <span className="text-xs text-purple-400 font-medium">
                        ✅ Joined
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-3">❓ How Quest Arena Works</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <div className="flex items-start gap-3 p-2 bg-gray-800 rounded">
            <span className="text-purple-400 font-bold">1.</span>
            <div>
              <div className="font-medium text-white">Natural Conversations</div>
              <div className="text-gray-400">Chat naturally in XMTP groups - our AI Quest Masters analyze patterns</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 bg-gray-800 rounded">
            <span className="text-purple-400 font-bold">2.</span>
            <div>
              <div className="font-medium text-white">AI-Generated Quests</div>
              <div className="text-gray-400">Based on conversation topics and group dynamics, personalized quests are created</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 bg-gray-800 rounded">
            <span className="text-purple-400 font-bold">3.</span>
            <div>
              <div className="font-medium text-white">Complete & Earn</div>
              <div className="text-gray-400">Join quests, complete challenges, and earn XP, tokens, and achievements</div>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 bg-gray-800 rounded">
            <span className="text-purple-400 font-bold">4.</span>
            <div>
              <div className="font-medium text-white">Level Up</div>
              <div className="text-gray-400">Build your social score, unlock new features, and compete with friends!</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 