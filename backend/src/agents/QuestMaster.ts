import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { JsonOutputFunctionsParser } from "langchain/output_parsers";
import type { Group, Conversation, DecodedMessage } from "@xmtp/node-sdk";
import { v4 as uuidv4 } from "uuid";
import { EventEmitter } from "events";

// Quest Types Schema
const QuestSchema = z.object({
  id: z.string(),
  type: z.enum([
    "social_challenge",
    "knowledge_quest", 
    "creative_contest",
    "community_building",
    "cross_protocol"
  ]),
  title: z.string(),
  description: z.string(),
  difficulty: z.enum(["easy", "medium", "hard", "expert"]),
  duration: z.number(), // in minutes
  participants: z.object({
    min: z.number(),
    max: z.number(),
  }),
  rewards: z.object({
    xp: z.number(),
    tokens: z.number().optional(),
    badges: z.array(z.string()).optional(),
  }),
  requirements: z.array(z.string()).optional(),
  miniAppConfig: z.object({
    type: z.enum(["dashboard", "game", "poll", "leaderboard", "gallery"]),
    config: z.record(z.any()),
  }),
});

const UserProfileSchema = z.object({
  inboxId: z.string(),
  level: z.number().default(1),
  xp: z.number().default(0),
  preferences: z.array(z.string()).default([]),
  completedQuests: z.array(z.string()).default([]),
  socialScore: z.number().default(0),
  lastActive: z.date().default(() => new Date()),
});

type Quest = z.infer<typeof QuestSchema>;
type UserProfile = z.infer<typeof UserProfileSchema>;

export interface QuestMasterPersonality {
  name: string;
  description: string;
  questTypes: Quest["type"][];
  style: "encouraging" | "competitive" | "creative" | "analytical" | "adventurous";
  systemPrompt: string;
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
  private llm: ChatOpenAI;
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
    this.llm = new ChatOpenAI({
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

      const questPrompt = PromptTemplate.fromTemplate(`
        ${this.personality.systemPrompt}

        Based on the following conversation analysis, create an engaging quest for this group:

        Group Size: {groupSize}
        Activity Level: {activityLevel}
        Topics Discussed: {topics}
        User Engagement: {engagement}
        Time of Day: {timeOfDay}

        Recent Messages Context:
        {recentContext}

        Create a quest that:
        1. Matches the current group mood and activity
        2. Is appropriate for {groupSize} participants
        3. Aligns with your personality as {personalityName}
        4. Uses one of your preferred quest types: {questTypes}
        5. Includes a mini-app component for interaction

        Return a JSON object with the quest details following this schema:
        {questSchema}
      `);

      const questChain = questPrompt
        .pipe(this.llm.bind({
          functions: [
            {
              name: "create_quest",
              description: "Create a new quest based on conversation analysis",
              parameters: zodToJsonSchema(QuestSchema),
            },
          ],
          function_call: { name: "create_quest" },
        }))
        .pipe(new JsonOutputFunctionsParser());

      const quest = await questChain.invoke({
        groupSize: groupMembers.length,
        activityLevel: conversationAnalysis.activityLevel,
        topics: conversationAnalysis.topics.join(", "),
        engagement: conversationAnalysis.engagement,
        timeOfDay: new Date().getHours(),
        recentContext: this.summarizeRecentMessages(recentMessages),
        personalityName: this.personality.name,
        questTypes: this.personality.questTypes.join(", "),
        questSchema: JSON.stringify(zodToJsonSchema(QuestSchema), null, 2),
      });

      // Add unique ID and validate
      const questWithId = {
        ...quest,
        id: uuidv4(),
      };

      // Validate the quest
      const validatedQuest = QuestSchema.parse(questWithId);
      this.activeQuests.set(validatedQuest.id, validatedQuest);

      this.emit("questCreated", validatedQuest, conversation.id);
      return validatedQuest;

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
   * Extract topics from messages using LLM
   */
  private extractTopics(messages: DecodedMessage[]): string[] {
    const messageTexts = messages
      .slice(-10) // Last 10 messages
      .map(m => String(m.content))
      .filter(text => text.length > 0);

    if (messageTexts.length === 0) return ["general"];

    // Simple keyword extraction - could be enhanced with LLM
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

    this.emit("questCompleted", {
      questId,
      participantInboxId,
      rewards: quest.rewards,
      newLevel: userProfile.level,
      result,
    });
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
    const announcementPrompt = PromptTemplate.fromTemplate(`
      ${this.personality.systemPrompt}

      Create an exciting announcement message for this quest:
      
      Title: {title}
      Type: {type}
      Description: {description}
      Difficulty: {difficulty}
      Duration: {duration} minutes
      Participants: {minParticipants}-{maxParticipants}
      Rewards: {xp} XP{tokenRewards}{badges}

      Write a message that:
      1. Gets people excited about participating
      2. Clearly explains what they need to do
      3. Mentions the mini-app will launch
      4. Matches your personality as {personalityName}
      5. Is concise but engaging

      Keep it under 200 words.
    `);

    const chain = announcementPrompt.pipe(this.llm).pipe(new StringOutputParser());

    return await chain.invoke({
      title: quest.title,
      type: quest.type.replace("_", " "),
      description: quest.description,
      difficulty: quest.difficulty,
      duration: quest.duration,
      minParticipants: quest.participants.min,
      maxParticipants: quest.participants.max,
      xp: quest.rewards.xp,
      tokenRewards: quest.rewards.tokens ? `, ${quest.rewards.tokens} tokens` : "",
      badges: quest.rewards.badges?.length ? `, badges: ${quest.rewards.badges.join(", ")}` : "",
      personalityName: this.personality.name,
    });
  }

  /**
   * Get active quests for a conversation
   */
  getActiveQuests(conversationId?: string): Quest[] {
    return Array.from(this.activeQuests.values());
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