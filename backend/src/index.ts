/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  Client,
  type Conversation,
  type Group,
  type XmtpEnv,
  type DecodedMessage,
} from "@xmtp/node-sdk";
import cors from "cors";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import {
  appendToEnv,
  createSigner,
  defaultInboxes,
  getDbPath,
  getEncryptionKeyFromHex,
  validateEnvironment,
} from "./helper";
import { QuestMaster, QUEST_MASTER_PERSONALITIES } from "./agents/QuestMaster";
import { QuestOrchestrator } from "./services/QuestOrchestrator";
import { MiniAppLauncher } from "./services/MiniAppLauncher";
import type { Quest } from "./types/Quest";

const { 
  WALLET_KEY, 
  API_SECRET_KEY, 
  ENCRYPTION_KEY, 
  XMTP_ENV, 
  PORT,
  OPENAI_API_KEY 
} = validateEnvironment([
  "WALLET_KEY",
  "API_SECRET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "PORT",
  "OPENAI_API_KEY",
]);

let GROUP_ID = process.env.GROUP_ID;

// Global XMTP client
let xmtpClient: Client;

// AI Quest Master instances
let questMasters: Map<string, QuestMaster> = new Map();
let questOrchestrator: QuestOrchestrator;
let miniAppLauncher: MiniAppLauncher;

// WebSocket server for real-time updates
let wss: WebSocketServer;

// Initialize Quest Masters with different personalities
const initializeQuestMasters = () => {
  questMasters.clear();
  
  QUEST_MASTER_PERSONALITIES.forEach((personality) => {
    const questMaster = new QuestMaster(personality, OPENAI_API_KEY);
    questMasters.set(personality.name, questMaster);
    
    // Listen for quest events
    questMaster.on("questCreated", (quest: Quest, conversationId: string) => {
      console.log(`🎯 Quest "${quest.title}" created by ${personality.name} for conversation ${conversationId}`);
      broadcastToClients({
        type: "questCreated",
        data: { quest, conversationId, questMaster: personality.name }
      });
      
      // Launch mini app for the quest
      void miniAppLauncher.launchQuestMiniApp(quest, conversationId);
    });
    
    questMaster.on("questCompleted", (completion) => {
      console.log(`🏆 Quest completed by ${completion.participantInboxId}`);
      broadcastToClients({
        type: "questCompleted", 
        data: completion
      });
    });
  });
  
  console.log(`✅ Initialized ${questMasters.size} Quest Masters`);
};

// Initialize XMTP client and services
const initializeXmtpClient = async () => {
  // Create wallet signer and encryption key
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
  const dbPath = getDbPath(XMTP_ENV);
  
  // Create XMTP client
  xmtpClient = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    dbPath,
  });

  console.log("📡 XMTP Client initialized with inbox ID:", xmtpClient.inboxId);
  await xmtpClient.conversations.sync();
  
  let conversation: Conversation | undefined;
  console.log("🆔 GROUP_ID", GROUP_ID);
  
  if (GROUP_ID) {
    conversation = await xmtpClient.conversations.getConversationById(GROUP_ID);
  } else {
    conversation = await xmtpClient.conversations.newGroup(defaultInboxes);
    console.log("🆕 New group created:", conversation.id);
    GROUP_ID = conversation.id;
    appendToEnv("GROUP_ID", GROUP_ID);
  }
  
  await (conversation as Group).updateName("XMTP Social Quest Arena");

  if (!conversation) {
    console.error("❌ Failed to initialize XMTP client");
    return;
  }
  
  const message = await conversation.send("🎮 Welcome to the Social Quest Arena! AI Quest Masters are standing by to create amazing challenges for our community!");
  console.log("💬 Welcome message sent:", message);

  await xmtpClient.conversations.sync();

  const isAdmin = (conversation as Group).isSuperAdmin(xmtpClient.inboxId);
  await conversation.sync();
  console.log("👑 Client is admin of the group:", isAdmin);
  
  // Initialize services
  questOrchestrator = new QuestOrchestrator(questMasters, xmtpClient);
  miniAppLauncher = new MiniAppLauncher();
  
  // Start monitoring conversations for quest opportunities
  void startConversationMonitoring();
};

// Monitor conversations for quest creation opportunities
const startConversationMonitoring = async () => {
  console.log("👁️ Starting conversation monitoring for quest opportunities...");
  
  try {
    const stream = await xmtpClient.conversations.streamAllMessages();
    
    for await (const message of stream) {
      if (
        message?.senderInboxId.toLowerCase() === xmtpClient.inboxId.toLowerCase() ||
        message?.contentType?.typeId !== "text"
      ) {
        continue;
      }
      
      try {
        await handleNewMessage(message);
      } catch (error) {
        console.error("❌ Error handling message:", error);
      }
    }
  } catch (error) {
    console.error("❌ Error in conversation monitoring:", error);
    // Restart monitoring after delay
    setTimeout(() => {
      void startConversationMonitoring();
    }, 10000);
  }
};

// Handle new messages and trigger quest creation
const handleNewMessage = async (message: DecodedMessage) => {
  const conversation = await xmtpClient.conversations.getConversationById(
    message.conversationId
  );
  
  if (!conversation || !(conversation instanceof Group)) {
    return;
  }
  
  // Check if it's time to create a quest
  const shouldCreateQuest = await questOrchestrator.shouldCreateQuest(
    conversation,
    message
  );
  
  if (shouldCreateQuest) {
    console.log("🎯 Triggering quest creation for conversation:", conversation.id);
    await questOrchestrator.createQuestForConversation(conversation);
  }
};

// Broadcast message to all connected WebSocket clients
const broadcastToClients = (message: any) => {
  if (!wss) return;
  
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
};

// XMTP Service Functions (enhanced with quest features)
const removeUserFromDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient.conversations.getConversationById(
      GROUP_ID ?? "",
    );

    if (!conversation) {
      throw new Error(
        `Conversation not found with id: ${GROUP_ID} on env: ${XMTP_ENV}`,
      );
    }
    
    await conversation.sync();
    console.log("📝 conversation", conversation.id);
    const groupMembers = await (conversation as Group).members();
    const isMember = groupMembers.some(
      (member) => member.inboxId === newUserInboxId,
    );
    
    if (isMember) {
      await conversation.sync();
      await (conversation as Group).removeMembers([newUserInboxId]);
      console.log("👋 Removed user from group");
      
      // Notify quest masters about member change
      questOrchestrator.notifyMemberChange(conversation.id, "removed", newUserInboxId);
    } else {
      console.log("🚫 User not in group");
      return false;
    }
    return true;
  } catch (error) {
    console.error("❌ Error removing user from default group chat:", error);
    return false;
  }
};

const addUserToDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient.conversations.getConversationById(
      GROUP_ID ?? "",
    );

    if (!conversation) {
      throw new Error(
        `Conversation not found with id: ${GROUP_ID} on env: ${XMTP_ENV}`,
      );
    }
    
    await conversation.sync();
    console.log("📝 conversation", conversation.id);
    const groupMembers = await (conversation as Group).members();
    const isMember = groupMembers.some(
      (member) => member.inboxId === newUserInboxId,
    );
    
    if (!isMember) {
      await conversation.sync();
      await (conversation as Group).addMembers([newUserInboxId]);
      await conversation.send(`🎉 Welcome to the Social Quest Arena! Get ready for AI-powered adventures and challenges!`);
      console.log("✅ Added user to group");
      
      // Notify quest masters about new member
      questOrchestrator.notifyMemberChange(conversation.id, "added", newUserInboxId);
    } else {
      console.log("ℹ️ User already in group");
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ Error adding user to default group chat:", error);
    return false;
  }
};

// API Middleware
const validateApiSecret = (req: Request, res: Response, next: () => void) => {
  console.log("🔑 validateApiSecret called for path:", req.path);
  const apiSecret = req.headers["x-api-secret"];
  if (apiSecret !== API_SECRET_KEY) {
    console.log("❌ Invalid API secret:", apiSecret);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  console.log("✅ API secret validated successfully");
  next();
};

// Express App Setup
const app = express();
const server = createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json());

// Add global request logger
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// WebSocket Setup for real-time updates
wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🔌 New WebSocket connection");
  
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log("📨 WebSocket message received:", message);
      
      // Handle different message types
      switch (message.type) {
        case "subscribe":
          // Client subscribing to updates
          ws.send(JSON.stringify({ type: "subscribed", data: "Connected to Quest Arena" }));
          break;
        case "questAction":
          // Handle quest-related actions
          void handleQuestAction(message.data, ws);
          break;
      }
    } catch (error) {
      console.error("❌ Error handling WebSocket message:", error);
    }
  });
  
  ws.on("close", () => {
    console.log("🔌 WebSocket connection closed");
  });
});

// Handle quest actions from frontend
const handleQuestAction = async (data: any, ws: any) => {
  try {
    switch (data.action) {
      case "joinQuest":
        await questOrchestrator.joinQuest(data.questId, data.userInboxId);
        break;
      case "completeQuest":
        await questOrchestrator.completeQuest(data.questId, data.userInboxId, data.result);
        break;
      case "getUserStats":
        const stats = questOrchestrator.getUserStats(data.userInboxId);
        ws.send(JSON.stringify({ type: "userStats", data: stats }));
        break;
    }
  } catch (error) {
    console.error("❌ Error handling quest action:", error);
    ws.send(JSON.stringify({ type: "error", data: error.message }));
  }
};

// Routes

app.get("/health", (req, res) => {
  console.log("✅ HEALTH CHECK ENDPOINT HIT");
  res.json({ 
    status: "ok", 
    questMasters: Array.from(questMasters.keys()),
    activeQuests: questOrchestrator?.getActiveQuests()?.length || 0
  });
});

// Enhanced group endpoints with quest features
app.post(
  "/api/xmtp/add-inbox",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const { inboxId } = req.body as { inboxId: string };
      console.log(
        "➕ Adding user to default group chat with id:",
        GROUP_ID,
        "and inboxId:",
        inboxId,
      );
      const result = await addUserToDefaultGroupChat(inboxId);
      res.status(200).json({
        success: result,
        message: result
          ? "Successfully added user to Social Quest Arena"
          : "You are already in the group",
      });
      console.log("⚪ Response sent for add-inbox");
    } catch (error) {
      console.error("❌ Error adding user to default group chat:", error);
      res.status(500).json({
        message: "You are not in the group",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

app.post(
  "/api/xmtp/remove-inbox",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const { inboxId } = req.body as { inboxId: string };
      console.log("➖ Removing user from group with inboxId:", inboxId);
      const result = await removeUserFromDefaultGroupChat(inboxId);
      res.status(200).json({
        success: result,
        message: result
          ? "Successfully removed user from Social Quest Arena"
          : "Failed to remove user from Social Quest Arena",
      });
      console.log("⚪ Response sent for remove-inbox");
    } catch (error) {
      console.error("❌ Error removing user from default group chat:", error);
      res.status(500).json({
        message: "Failed to remove user from Social Quest Arena",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Enhanced group info with quest data
app.get(
  "/api/xmtp/get-group-id",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      console.log("🔵 Inside get-group-id async block");
      console.log("Current client inbox ID:", req.query.inboxId);
      console.log("Looking for group with ID:", GROUP_ID);
      
      const conversation = await xmtpClient.conversations.getConversationById(
        GROUP_ID ?? "",
      );
      console.log("🟢 Conversation fetched:", conversation?.id);
      
      if (!conversation) {
        console.log("⚠️ No conversation found");
        return res.status(404).json({ error: "Group not found" });
      }
      
      await conversation.sync();
      console.log("🟡 Conversation synced");

      const groupMembers = await (conversation as Group).members();
      const messages = await (conversation as Group).messages();
      const lastMessage =
        messages.length > 0 ? messages[messages.length - 1] : null;

      const isMember = groupMembers.some(
        (member) => member.inboxId === req.query.inboxId,
      );

      console.log("🟣 isMember check complete:", isMember);
      console.log("🟣 Client inbox ID:", req.query.inboxId);

      // Get quest data
      const activeQuests = questOrchestrator?.getActiveQuests() || [];
      const userStats = req.query.inboxId 
        ? questOrchestrator?.getUserStats(req.query.inboxId as string) 
        : null;

      // Format member information for the response
      const formattedMembers = groupMembers.map((member) => ({
        inboxId: member.inboxId,
        displayInboxId: `${member.inboxId.slice(0, 6)}...${member.inboxId.slice(-6)}`,
        isAdmin: (conversation as Group).isAdmin(member.inboxId),
        isSuperAdmin: (conversation as Group).isSuperAdmin(member.inboxId),
        questStats: questOrchestrator?.getUserStats(member.inboxId),
      }));

      // Format last message for the response
      const formattedLastMessage = lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            sentAt: lastMessage.sentAt,
            senderInboxId: lastMessage.senderInboxId || "unknown",
            displaySenderId: lastMessage.senderInboxId
              ? `${lastMessage.senderInboxId.slice(0, 6)}...${lastMessage.senderInboxId.slice(-6)}`
              : "unknown",
          }
        : null;

      const responseObject = {
        groupId: process.env.GROUP_ID,
        groupName: (conversation as Group).name,
        isMember,
        memberCount: groupMembers.length,
        members: formattedMembers,
        lastMessage: formattedLastMessage,
        messageCount: messages.length,
        // Quest Arena specific data
        activeQuests: activeQuests.length,
        userStats,
        questMasters: Array.from(questMasters.keys()),
      };

      res.json(responseObject);
      console.log("⚪ Response sent for get-group-id");
    } catch (error) {
      console.error("❌ Error in get-group-id:", error);
      res.status(500).json({ error: "Failed to fetch group info" });
    }
  },
);

// New Quest-specific endpoints

app.get(
  "/api/quests/active",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const activeQuests = questOrchestrator?.getActiveQuests() || [];
      res.json({
        quests: activeQuests,
        count: activeQuests.length,
      });
    } catch (error) {
      console.error("❌ Error fetching active quests:", error);
      res.status(500).json({ error: "Failed to fetch active quests" });
    }
  },
);

app.get(
  "/api/quests/user/:inboxId/stats",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const { inboxId } = req.params;
      const stats = questOrchestrator?.getUserStats(inboxId);
      res.json(stats);
    } catch (error) {
      console.error("❌ Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  },
);

app.post(
  "/api/quests/trigger",
  validateApiSecret,
  async (req: Request, res: Response) => {
    try {
      const { conversationId, questMasterName } = req.body;
      
      const conversation = await xmtpClient.conversations.getConversationById(conversationId);
      if (!conversation || !(conversation instanceof Group)) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      const questMaster = questMasterName 
        ? questMasters.get(questMasterName)
        : questOrchestrator.selectQuestMaster(conversation);
        
      if (!questMaster) {
        return res.status(400).json({ error: "Quest Master not found" });
      }
      
      const quest = await questOrchestrator.createQuestForConversation(conversation, questMaster);
      
      res.json({
        success: true,
        quest,
        message: "Quest created successfully"
      });
    } catch (error) {
      console.error("❌ Error triggering quest:", error);
      res.status(500).json({ error: "Failed to trigger quest" });
    }
  },
);

// Start Server
void (async () => {
  try {
    // Initialize Quest Masters first
    initializeQuestMasters();
    
    // Then initialize XMTP client and services
    await initializeXmtpClient();
    
    server.listen(PORT, () => {
      console.log(`🚀 Social Quest Arena Server is running on port ${PORT}`);
      console.log(`🎮 Ready to create amazing social experiences!`);
    });
  } catch (error) {
    console.error("❌ Failed to initialize Social Quest Arena:", error);
    process.exit(1);
  }
})();
