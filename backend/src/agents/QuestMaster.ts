import { EventEmitter } from "events";
import type { Group, DecodedMessage } from "@xmtp/node-sdk";
import { v4 as uuidv4 } from "uuid";
import type { Quest, UserProfile, QuestCompletion, QuestMasterPersonality } from "../types/Quest";

// Simple mock implementations for LangChain dependencies
class MockChatOpenAI {
  constructor(private config: any) {}
  
  async invoke(prompt: string): Promise<string> {
    // Simple mock response based on quest master personality
    return `Mock quest response for: ${prompt.slice(0, 100)}...`;
  }
}

class MockPromptTemplate {
  static fromTemplate(template: string) {
    return {
      pipe: (llm: any) => ({
        pipe: (parser: any) => ({
          invoke: async (variables: any) => {
            // Mock quest generation based on variables
            return {
              title: `${variables.personalityName} Challenge`,
              description: `A ${variables.questTypes.split(',')[0]} quest for ${variables.groupSize} participants`,
              type: variables.questTypes.split(',')[0].trim().replace(' ', '_') as Quest["type"],
              difficulty: "medium" as const,
              duration: 30,
              participantLimits: { min: 2, max: variables.groupSize },
              rewards: { xp: 100, tokens: 10 },
              miniAppConfig: {
                type: "dashboard" as const,
                config: { theme: "default" }
              }
            };
          }
        })
      })
    };
  }
}

export const QUEST_MASTER_PERSONALITIES: QuestMasterPersonality[] = [
  {
    name: "The Mentor",
    description: "Guides users through skill development and learning",
    questTypes: ["knowledge_quest", "community_building"],
    style: "encouraging",
    systemPrompt: `You are The Mentor, a wise and encouraging Quest Master. You focus on helping users learn and grow through thoughtful challenges. You create quests that build skills incrementally and celebrate small victories. Your tone is supportive and educational.`
  },
  {
    name: "The Competitor", 
    description: "Creates competitive challenges and tournaments",
    questTypes: ["social_challenge", "knowledge_quest"],
    style: "competitive",
    systemPrompt: `You are The Competitor, an energetic Quest Master who loves competition and achievement. You create exciting challenges that pit users against each other in friendly rivalry. Your tone is enthusiastic and motivating.`
  },
  {
    name: "The Creator",
    description: "Fosters artistic and creative expression", 
    questTypes: ["creative_contest", "community_building"],
    style: "creative",
    systemPrompt: `You are The Creator, an artistic Quest Master who inspires imagination and self-expression. You design quests that encourage users to create, share, and collaborate on artistic projects. Your tone is inspiring and open-minded.`
  },
  {
    name: "The Connector",
    description: "Facilitates networking and relationship building",
    questTypes: ["social_challenge", "community_building"],
    style: "analytical",
    systemPrompt: `You are The Connector, a socially intelligent Quest Master who helps users build meaningful relationships. You create quests that encourage collaboration, communication, and community building. Your tone is warm and inclusive.`
  },
  {
    name: "The Explorer", 
    description: "Introduces users to new protocols and technologies",
    questTypes: ["cross_protocol", "knowledge_quest"],
    style: "adventurous",
    systemPrompt: `You are The Explorer, an innovative Quest Master who loves discovering new frontiers in Web3. You create quests that introduce users to cutting-edge protocols and technologies. Your tone is curious and pioneering.`
  }
];

export class QuestMaster extends EventEmitter {
  private llm: MockChatOpenAI;
  private personality: QuestMasterPersonality;
  private userProfiles: Map<string, UserProfile> = new Map();
  private activeQuests: Map<string, Quest> = new Map();
  private conversationAnalytics: Map<string, any> = new Map();

  constructor(
    personality: QuestMasterPersonality,
    openaiApiKey: string,
    model: string = "gpt-4-turbo-preview"
  ) {
    super();
    this.personality = personality;
    this.llm = new MockChatOpenAI({
      openAIApiKey: openaiApiKey,
      modelName: model,
      temperature: 0.7,
    });
  }

  /**
   * Analyze conversation dynamics and generate appropriate quest
   */
  async analyzeAndCreateQuest(
    conversation: Group,
    recentMessages: DecodedMessage[],
    groupMembers: any[]
  ): Promise<Quest | null> {
    try {
      const conversationAnalysis = await this.analyzeConversation(
        recentMessages,
        groupMembers
      );

      // Create quest using mock template
      const questPrompt = MockPromptTemplate.fromTemplate(`
        ${this.personality.systemPrompt}
        Create a quest for group size: {groupSize}
        Activity level: {activityLevel}
        Topics: {topics}
        Personality: {personalityName}
        Quest types: {questTypes}
      `);

      const questChain = questPrompt.pipe(this.llm).pipe({ invoke: async (data: any) => data });

      const questData = await questChain.invoke({
        groupSize: groupMembers.length,
        activityLevel: conversationAnalysis.activityLevel,
        topics: conversationAnalysis.topics.join(", "),
        engagement: conversationAnalysis.engagement,
        timeOfDay: new Date().getHours(),
        recentContext: this.summarizeRecentMessages(recentMessages),
        personalityName: this.personality.name,
        questTypes: this.personality.questTypes.join(", "),
      });

      // Create complete quest object with all required fields
      const quest: Quest = {
        id: uuidv4(),
        type: questData.type || this.personality.questTypes[0],
        title: questData.title || `${this.personality.name} Challenge`,
        description: questData.description || `A quest created by ${this.personality.name}`,
        difficulty: questData.difficulty || "medium",
        duration: questData.duration || 30,
        participantLimits: questData.participantLimits || { min: 2, max: Math.max(2, groupMembers.length) },
        rewards: questData.rewards || { xp: 100, tokens: 10 },
        requirements: (questData as any).requirements || [],
        miniAppConfig: questData.miniAppConfig || {
          type: "dashboard",
          config: { theme: "default" }
        },
        conversationId: conversation.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (questData.duration || 30) * 60 * 1000), // duration in minutes
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
   * Extract topics from messages
   */
  private extractTopics(messages: DecodedMessage[]): string[] {
    const messageTexts = messages
      .slice(-10) // Last 10 messages
      .map(m => String(m.content))
      .filter(text => text.length > 0);

    if (messageTexts.length === 0) return ["general"];

    // Simple keyword extraction
    const commonWords = messageTexts
      .join(" ")
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return Object.entries(commonWords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([word]) => word);
  }

  /**
   * Calculate conversation activity level
   */
  private calculateActivityLevel(recentMessages: DecodedMessage[]): "low" | "medium" | "high" {
    const messageCount = recentMessages.length;
    if (messageCount < 5) return "low";
    if (messageCount < 15) return "medium";
    return "high";
  }

  /**
   * Calculate user engagement score
   */
  private calculateEngagement(messages: DecodedMessage[], members: any[]): number {
    const activeUsers = new Set(messages.map(m => m.senderInboxId)).size;
    const totalUsers = members.length;
    return totalUsers > 0 ? activeUsers / totalUsers : 0;
  }

  /**
   * Summarize recent messages for context
   */
  private summarizeRecentMessages(messages: DecodedMessage[]): string {
    return messages
      .slice(-5)
      .map(m => `User: ${String(m.content)}`)
      .join("\n");
  }

  /**
   * Handle quest completion and rewards
   */
  async completeQuest(
    questId: string,
    participantInboxId: string,
    result: any
  ): Promise<void> {
    const quest = this.activeQuests.get(questId);
    if (!quest) return;

    const userProfile = this.getUserProfile(participantInboxId);
    
    // Update user profile
    userProfile.completedQuests.push(questId);
    userProfile.xp += quest.rewards.xp;
    userProfile.level = Math.floor(userProfile.xp / 100) + 1;

    this.userProfiles.set(participantInboxId, userProfile);

    const completion: QuestCompletion = {
      questId,
      participantInboxId,
      completedAt: new Date(),
      result,
      rewards: quest.rewards,
      newLevel: userProfile.level,
    };

    this.emit("questCompleted", completion);
  }

  /**
   * Get or create user profile
   */
  private getUserProfile(inboxId: string): UserProfile {
    if (!this.userProfiles.has(inboxId)) {
      this.userProfiles.set(inboxId, {
        inboxId,
        level: 1,
        xp: 0,
        preferences: [],
        completedQuests: [],
        socialScore: 0,
        lastActive: new Date(),
      });
    }
    return this.userProfiles.get(inboxId)!;
  }

  /**
   * Generate quest announcement message
   */
  async generateQuestAnnouncement(quest: Quest): Promise<string> {
    // Simple template-based announcement
    const announcement = `
🎯 **${quest.title}** 

${quest.description}

📊 **Details:**
• Type: ${quest.type.replace('_', ' ')}
• Difficulty: ${quest.difficulty}
• Duration: ${quest.duration} minutes
• Participants: ${quest.participantLimits.min}-${quest.participantLimits.max}
• Rewards: ${quest.rewards.xp} XP${quest.rewards.tokens ? ` + ${quest.rewards.tokens} tokens` : ''}

🚀 Mini app launching soon! Get ready to participate!
    `.trim();

    return announcement;
  }

  /**
   * Get active quests for a conversation
   */
  getActiveQuests(conversationId?: string): Quest[] {
    const quests = Array.from(this.activeQuests.values());
    return conversationId 
      ? quests.filter(quest => quest.conversationId === conversationId)
      : quests;
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
    profile.lastActive = new Date();
    this.userProfiles.set(inboxId, profile);
  }
} 