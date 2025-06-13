"use client";

import { useEffect, useState } from "react";
import { useXMTP } from "@/context/xmtp-context";

interface Quest {
  id: string;
  type: string;
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
}

export default function QuestDashboard() {
  const { client } = useXMTP();
  const [activeQuests, setActiveQuests] = useState<Quest[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [questMasters, setQuestMasters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    if (!client) return;

    const websocket = new WebSocket(`ws://localhost:3001`);
    
    websocket.onopen = () => {
      console.log("🔌 Connected to Quest Arena WebSocket");
      websocket.send(JSON.stringify({ type: "subscribe" }));
    };

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("📨 Quest update received:", message);
        
        switch (message.type) {
          case "questCreated":
            setActiveQuests(prev => [...prev, message.data.quest]);
            break;
          case "questCompleted":
            setActiveQuests(prev => 
              prev.filter(quest => quest.id !== message.data.questId)
            );
            break;
          case "userStats":
            setUserStats(message.data);
            break;
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    websocket.onclose = () => {
      console.log("🔌 Quest Arena WebSocket disconnected");
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, [client]);

  // Fetch initial data
  useEffect(() => {
    if (!client) return;

    const fetchQuestData = async () => {
      try {
        setLoading(true);
        
        // Mock quest masters for now
        setQuestMasters(["The Mentor", "The Competitor", "The Creator", "The Connector", "The Explorer"]);
        
        // Mock user stats
        setUserStats({
          level: 3,
          xp: 250,
          questsCompleted: 5,
          socialScore: 85
        });

        // Mock active quests
        setActiveQuests([
          {
            id: "quest-1",
            type: "social_challenge",
            title: "Community Builder Challenge",
            description: "Invite 3 new members to join our group chat and help them get started!",
            difficulty: "medium",
            duration: 60,
            participantLimits: { min: 1, max: 5 },
            rewards: { xp: 150, tokens: 25 },
            status: "active",
            participants: [],
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          }
        ]);
        
      } catch (error) {
        console.error("Error fetching quest data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuestData();
  }, [client]);

  const joinQuest = (questId: string) => {
    if (ws && client) {
      ws.send(JSON.stringify({
        type: "questAction",
        data: {
          action: "joinQuest",
          questId,
          userInboxId: client.inboxId,
        },
      }));
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "text-green-400";
      case "medium": return "text-yellow-400";
      case "hard": return "text-orange-400";
      case "expert": return "text-red-400";
      default: return "text-gray-400";
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

  if (!client) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <p className="text-gray-400 text-center">Connect your wallet to access Quest Arena</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-purple-900 via-blue-900 to-indigo-900 rounded-lg p-4 border border-purple-500">
        <h2 className="text-xl font-bold text-white mb-2">🎮 Welcome to Quest Arena!</h2>
        <p className="text-purple-200 text-sm">
          AI Quest Masters are watching your conversations and creating personalized challenges. 
          Complete quests to earn XP, tokens, and unlock achievements!
        </p>
      </div>

      {/* User Stats */}
      {userStats && (
        <div className="bg-gradient-to-r from-purple-900 to-blue-900 rounded-lg p-4 border border-purple-500">
          <h3 className="text-lg font-bold text-white mb-2">🏆 Your Quest Stats</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-300">Level:</span>
              <span className="text-yellow-400 font-bold ml-2">{userStats.level}</span>
            </div>
            <div>
              <span className="text-gray-300">XP:</span>
              <span className="text-blue-400 font-bold ml-2">{userStats.xp}</span>
            </div>
            <div>
              <span className="text-gray-300">Completed:</span>
              <span className="text-green-400 font-bold ml-2">{userStats.questsCompleted}</span>
            </div>
            <div>
              <span className="text-gray-300">Social Score:</span>
              <span className="text-pink-400 font-bold ml-2">{userStats.socialScore}</span>
            </div>
          </div>
        </div>
      )}

      {/* Quest Masters */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-2">🤖 Quest Masters</h3>
        <p className="text-gray-400 text-xs mb-3">
          AI personalities that create quests based on your group conversations
        </p>
        <div className="flex flex-wrap gap-2">
          {questMasters.map((master) => (
            <span
              key={master}
              className="px-2 py-1 bg-gray-800 text-gray-300 rounded-full text-xs border border-gray-600"
            >
              {master}
            </span>
          ))}
        </div>
      </div>

      {/* Active Quests */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-3">🎯 Active Quests</h3>
        
        {activeQuests.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">💬</div>
            <p className="text-gray-400 mb-2">No active quests yet!</p>
            <p className="text-gray-500 text-sm">
              Start chatting in the group to trigger new challenges from our AI Quest Masters
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeQuests.map((quest) => (
              <div
                key={quest.id}
                className="bg-gray-800 rounded-lg p-3 border border-gray-600 hover:border-purple-500 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{getQuestTypeIcon(quest.type)}</span>
                    <h4 className="font-semibold text-white">{quest.title}</h4>
                  </div>
                  <span className={`text-xs font-bold ${getDifficultyColor(quest.difficulty)}`}>
                    {quest.difficulty.toUpperCase()}
                  </span>
                </div>
                
                <p className="text-gray-300 text-sm mb-3">{quest.description}</p>
                
                <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
                  <span>⏱️ {quest.duration}min</span>
                  <span>👥 {quest.participantLimits.min}-{quest.participantLimits.max}</span>
                  <span>⭐ {quest.rewards.xp} XP</span>
                  {quest.rewards.tokens && <span>🪙 {quest.rewards.tokens}</span>}
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {quest.participants.length} joined
                  </span>
                  <button
                    onClick={() => joinQuest(quest.id)}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-full transition-colors"
                  >
                    Join Quest
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-2">❓ How It Works</h3>
        <div className="space-y-2 text-sm text-gray-300">
          <div className="flex items-start gap-2">
            <span className="text-purple-400">1.</span>
            <span>Chat naturally in the group - our AI Quest Masters are listening</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400">2.</span>
            <span>Based on conversation patterns, they&apos;ll create personalized quests</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400">3.</span>
            <span>Complete quests to earn XP, level up, and unlock achievements</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-400">4.</span>
            <span>Build your social score and compete with friends!</span>
          </div>
        </div>
      </div>
    </div>
  );
} 