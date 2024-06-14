import { EventEmitter } from "events";
import type { Group, DecodedMessage } from "@xmtp/node-sdk";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";
import type { Quest, UserProfile, QuestCompletion, QuestMasterPersonality } from "../types/Quest";

export const QUEST_MASTER_PERSONALITIES: QuestMasterPersonality[] = [
  {
    name: "The Mentor",
    description: "Guides users through skill development and learning",
    questTypes: ["knowledge_quest", "community_building"],
    style: "encouraging",
    systemPrompt: `You are The Mentor, a wise and encouraging Quest Master in the XMTP Social Quest Arena. You focus on helping users learn and grow through thoughtful challenges. You create quests that build skills incrementally and celebrate small victories. Your tone is supportive and educational.

When creating quests, consider:
- Educational value and skill development
- Progressive difficulty that builds confidence
- Community learning opportunities
- Knowledge sharing and mentorship
- Collaborative problem-solving

Always respond with a JSON object containing quest details that will engage and educate participants.`
  },
  {
    name: "The Competitor", 
    description: "Creates competitive challenges and tournaments",
    questTypes: ["social_challenge", "knowledge_quest"],
    style: "competitive",
    systemPrompt: `You are The Competitor, an energetic Quest Master who loves competition and achievement in the XMTP Social Quest Arena. You create exciting challenges that pit users against each other in friendly rivalry. Your tone is enthusiastic and motivating.

When creating quests, focus on:
- Competitive elements and leaderboards
- Achievement-based challenges
- Time-limited competitions
- Skill-based contests
- Team vs team challenges

Always respond with a JSON object containing quest details that will create exciting competition.`
  },
  {
    name: "The Creator",
    description: "Fosters artistic and creative expression", 
    questTypes: ["creative_contest", "community_building"],
    style: "creative",
    systemPrompt: `You are The Creator, an artistic Quest Master who inspires imagination and self-expression in the XMTP Social Quest Arena. You design quests that encourage users to create, share, and collaborate on artistic projects. Your tone is inspiring and open-minded.

When creating quests, emphasize:
- Creative expression and artistry
- Collaborative creation projects
- Innovation and experimentation
- Sharing and showcasing work
- Building creative communities

Always respond with a JSON object containing quest details that will inspire creativity.`
  },
  {
    name: "The Connector",
    description: "Facilitates networking and relationship building",
    questTypes: ["social_challenge", "community_building"],
    style: "analytical",
    systemPrompt: `You are The Connector, a socially intelligent Quest Master who helps users build meaningful relationships in the XMTP Social Quest Arena. You create quests that encourage collaboration, communication, and community building. Your tone is warm and inclusive.

When creating quests, focus on:
- Relationship building and networking
- Community engagement activities
- Collaboration and teamwork
- Communication skill development
- Inclusive community building

Always respond with a JSON object containing quest details that will bring people together.`
  },
  {
    name: "The Explorer", 
    description: "Introduces users to new protocols and technologies",
    questTypes: ["cross_protocol", "knowledge_quest"],
    style: "adventurous",
    systemPrompt: `You are The Explorer, an innovative Quest Master who loves discovering new frontiers in Web3 and the XMTP Social Quest Arena. You create quests that introduce users to cutting-edge protocols and technologies. Your tone is curious and pioneering.

When creating quests, emphasize:
- Web3 protocol exploration
- Technology adoption challenges
- Innovation and experimentation
- Cross-chain interactions
- Future-focused learning

Always respond with a JSON object containing quest details that will expand technological horizons.`
  }
];

export class QuestMaster extends EventEmitter {
  private openai: OpenAI;
  private _personality: QuestMasterPersonality;
  private userProfiles: Map<string, UserProfile> = new Map();
  private activeQuests: Map<string, Quest> = new Map();
  private conversationAnalytics: Map<string, any> = new Map();

  constructor(
    personality: QuestMasterPersonality,
    openaiApiKey: string,
    model: string = "gpt-4o"
  ) {
    super();
    this._personality = personality;
    this.openai = new OpenAI({
      apiKey: openaiApiKey,
    });
  }

  /**
   * Get the personality of this Quest Master
   */
  get personality(): QuestMasterPersonality {
    return this._personality;
  }

  /**
   * Get the personality of this Quest Master (alternative access method)
   */
  get getPersonality(): QuestMasterPersonality {
    return this._personality;
  }

  /**
   * Analyze conversation dynamics and generate appropriate quest
   */
  async analyzeAndCreateQuest(
    conversation: Group<any>,
    recentMessages: DecodedMessage[],
    groupMembers: any[]
  ): Promise<Quest | null> {
    try {
      const conversationAnalysis = await this.analyzeConversation(
        recentMessages,
        groupMembers
      );

      // Create quest using real OpenAI
      const questPrompt = `${this._personality.systemPrompt}

Based on the following conversation analysis, create an engaging quest:

Group Size: ${groupMembers.length} members
Activity Level: ${conversationAnalysis.activityLevel}
Recent Topics: ${conversationAnalysis.topics.join(", ")}
Engagement Score: ${conversationAnalysis.engagement}
Time of Day: ${new Date().getHours()}:00
Recent Context: ${this.summarizeRecentMessages(recentMessages)}

Create a quest that fits my personality (${this._personality.name}) and preferred quest types: ${this._personality.questTypes.join(", ")}.

Respond with a JSON object in this exact format:
{
  "title": "Quest title (max 60 characters)",
  "description": "Detailed quest description (max 200 characters)",
  "type": "one of: social_challenge, knowledge_quest, creative_contest, community_building, cross_protocol",
  "difficulty": "one of: easy, medium, hard, expert",
  "duration": "duration in minutes (15-120)",
  "participantLimits": {
    "min": "minimum participants (1-5)",
    "max": "maximum participants (2-20)"
  },
  "rewards": {
    "xp": "XP reward (50-500)",
    "tokens": "token reward (5-100, optional)",
    "badges": ["badge names if applicable"]
  },
  "requirements": ["list of requirements if any"],
  "miniAppConfig": {
    "type": "one of: dashboard, game, poll, leaderboard, gallery",
    "config": {
      "theme": "quest theme",
      "features": ["list of features"]
    }
  }
}`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: questPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const questResponse = completion.choices[0]?.message?.content;

      console.log("questResponse from openai", questResponse);
      if (!questResponse) {
        throw new Error("No response from OpenAI");
      }

      // Parse the JSON response
      let questData;
      try {
        questData = JSON.parse(questResponse);

        console.log("questData", questData);
      } catch (parseError) {
        console.error("Failed to parse OpenAI response:", questResponse);
        throw new Error("Invalid JSON response from OpenAI");
      }

      // Create complete quest object with all required fields
      const quest: Quest = {
        id: uuidv4(),
        type: questData.type || this._personality.questTypes[0],
        title: questData.title || `${this._personality.name} Challenge`,
        description: questData.description || `A quest created by ${this._personality.name}`,
        difficulty: questData.difficulty || "medium",
        duration: questData.duration || 30,
        participantLimits: questData.participantLimits || { min: 2, max: Math.max(2, groupMembers.length) },
        rewards: questData.rewards || { xp: 100, tokens: 10 },
        requirements: questData.requirements || [],
        miniAppConfig: questData.miniAppConfig || {
          type: "dashboard",
          config: { theme: "default", features: [] }
        },
        conversationId: conversation.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (questData.duration || 30) * 60 * 1000),
        status: "active",
        participants: [],
      };

      this.activeQuests.set(quest.id, quest);
      this.emit("questCreated", quest, conversation.id);
      return quest;

    } catch (error) {
      console.error("Error creating quest:", error);
      return null;
    }
  }

  /**
   * Analyze conversation patterns and user behavior
   */
  private async analyzeConversation(
    messages: DecodedMessage[],
    members: any[]
  ) {
    const now = new Date();
    const recentMessages = messages.filter(
      msg => (now.getTime() - msg.sentAt.getTime()) < 3600000 // Last hour
    );

    const topics = this.extractTopics(messages);
    const activityLevel = this.calculateActivityLevel(recentMessages);
    const engagement = this.calculateEngagement(messages, members);

    return {
      topics,
      activityLevel,
      engagement,
      messageCount: messages.length,
      activeUsers: new Set(messages.map(m => m.senderInboxId)).size,
    };
  }

  /**
   * Extract topics from messages using simple keyword analysis
   */
  private extractTopics(messages: DecodedMessage[]): string[] {
    const messageTexts = messages
      .map(m => m.content as string)
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    // Simple keyword extraction
    const keywords = [
      "web3", "crypto", "nft", "defi", "dao", "blockchain", "ethereum", "bitcoin",
      "art", "music", "design", "creative", "build", "code", "develop",
      "learn", "teach", "help", "mentor", "guide", "skill",
      "compete", "challenge", "game", "contest", "tournament",
      "community", "team", "collaborate", "together", "group"
    ];

    return keywords.filter(keyword => messageTexts.includes(keyword));
  }

  /**
   * Calculate activity level based on recent messages
   */
  private calculateActivityLevel(recentMessages: DecodedMessage[]): "low" | "medium" | "high" {
    const messageCount = recentMessages.length;
    if (messageCount < 5) return "low";
    if (messageCount < 15) return "medium";
    return "high";
  }

  /**
   * Calculate engagement score based on message patterns
   */
  private calculateEngagement(messages: DecodedMessage[], members: any[]): number {
    if (messages.length === 0) return 0;
    
    const uniqueSenders = new Set(messages.map(m => m.senderInboxId)).size;
    const totalMembers = members.length;
    
    return Math.min(100, (uniqueSenders / totalMembers) * 100);
  }

  /**
   * Summarize recent messages for context
   */
  private summarizeRecentMessages(messages: DecodedMessage[]): string {
    const recentTexts = messages
      .slice(-5) // Last 5 messages
      .map(m => m.content as string)
      .filter(Boolean)
      .join(" ");
    
    return recentTexts.slice(0, 200) + (recentTexts.length > 200 ? "..." : "");
  }

  /**
   * Complete a quest and update user profile
   */
  async completeQuest(
    questId: string,
    participantInboxId: string,
    result: any
  ): Promise<void> {
    const quest = this.activeQuests.get(questId);
    if (!quest) {
      throw new Error("Quest not found");
    }

    const userProfile = this.getUserProfile(participantInboxId);
    const newXP = userProfile.xp + quest.rewards.xp;
    const newLevel = Math.floor(newXP / 100) + 1;

    const completion: QuestCompletion = {
      questId,
      participantInboxId,
      completedAt: new Date(),
      result,
      rewards: quest.rewards,
      newLevel,
    };

    // Update user profile
    userProfile.xp = newXP;
    userProfile.level = newLevel;
    userProfile.completedQuests.push(questId);
    userProfile.lastActive = new Date();

    this.userProfiles.set(participantInboxId, userProfile);
    quest.status = "completed";

    this.emit("questCompleted", completion);
  }

  /**
   * Get or create user profile
   */
  private getUserProfile(inboxId: string): UserProfile {
    let profile = this.userProfiles.get(inboxId);
    if (!profile) {
      profile = {
        inboxId,
        level: 1,
        xp: 0,
        preferences: [],
        completedQuests: [],
        socialScore: 0,
        lastActive: new Date(),
      };
      this.userProfiles.set(inboxId, profile);
    }
    return profile;
  }

  /**
   * Generate quest announcement message
   */
  async generateQuestAnnouncement(quest: Quest): Promise<string> {
    const difficultyEmoji = {
      easy: "🟢",
      medium: "🟡", 
      hard: "🟠",
      expert: "🔴"
    };

    const typeEmoji = {
      social_challenge: "👥",
      knowledge_quest: "🧠",
      creative_contest: "🎨",
      community_building: "🏗️",
      cross_protocol: "🌐"
    };

    return `🎯 **New Quest Available!**

${typeEmoji[quest.type]} **${quest.title}**
${quest.description}

${difficultyEmoji[quest.difficulty]} **Difficulty:** ${quest.difficulty.toUpperCase()}
⏱️ **Duration:** ${quest.duration} minutes
👥 **Participants:** ${quest.participantLimits.min}-${quest.participantLimits.max}
🏆 **Rewards:** ${quest.rewards.xp} XP${quest.rewards.tokens ? ` + ${quest.rewards.tokens} tokens` : ""}

*Created by ${this._personality.name}*

React to join this quest! 🚀`;
  }

  /**
   * Get active quests for a conversation
   */
  getActiveQuests(conversationId?: string): Quest[] {
    const quests = Array.from(this.activeQuests.values());
    if (conversationId) {
      return quests.filter(q => q.conversationId === conversationId && q.status === "active");
    }
    return quests.filter(q => q.status === "active");
  }

  /**
   * Get user statistics
   */
  getUserStats(inboxId: string) {
    const profile = this.getUserProfile(inboxId);
    return {
      level: profile.level,
      xp: profile.xp,
      questsCompleted: profile.completedQuests.length,
      socialScore: profile.socialScore,
      lastActive: profile.lastActive,
    };
  }

  /**
   * Update user preferences based on quest participation
   */
  updateUserPreferences(inboxId: string, questType: Quest["type"]): void {
    const profile = this.getUserProfile(inboxId);
    if (!profile.preferences.includes(questType)) {
      profile.preferences.push(questType);
    }
    this.userProfiles.set(inboxId, profile);
  }
} 