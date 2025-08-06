export interface Quest {
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
  requirements?: string[];
  miniAppConfig: {
    type: "dashboard" | "game" | "poll" | "leaderboard" | "gallery";
    config: {
      theme?: string;
      features?: string[];
      [key: string]: any;
    };
  };
  conversationId: string;
  createdAt: Date | string;
  expiresAt: Date | string;
  status: "active" | "completed" | "expired";
  participants: string[];
}

export interface UserProfile {
  inboxId: string;
  level: number;
  xp: number;
  preferences: string[];
  completedQuests: string[];
  socialScore: number;
  lastActive: Date | string;
}

export interface QuestCompletion {
  questId: string;
  participantInboxId: string;
  completedAt: Date | string;
  result: any;
  rewards: {
    xp: number;
    tokens?: number;
    badges?: string[];
  };
  newLevel: number;
}

export interface QuestMasterPersonality {
  name: string;
  description: string;
  questTypes: Quest["type"][];
  style: "encouraging" | "competitive" | "creative" | "analytical" | "adventurous";
}

export interface MiniAppConfig {
  questId: string;
  conversationId: string;
  type: string;
  config: any;
  launchedAt: Date | string;
  url?: string;
  status: "active" | "completed" | "expired";
  participants: string[];
}

export interface QuestAnalytics {
  totalQuests: number;
  activeQuests: number;
  completedQuests: number;
  activeUsers: number;
  averageXpPerQuest: number;
  questTypeDistribution: Record<string, number>;
}

export interface WebSocketMessage {
  type: "subscribed" | "questCreated" | "questCompleted" | "questJoined" | "questLeft" | 
        "participantJoined" | "participantLeft" | "userStats" | "activeQuests" | 
        "questDetails" | "error";
  data: any;
}

export interface QuestActionMessage {
  type: "questAction";
  data: {
    action: "joinQuest" | "leaveQuest" | "completeQuest" | "getUserStats" | 
            "getActiveQuests" | "getQuestDetails";
    questId?: string;
    userInboxId?: string;
    conversationId?: string;
    result?: any;
  };
}