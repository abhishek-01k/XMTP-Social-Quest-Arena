# 🎮 XMTP Social Quest Arena

An innovative AI-powered mini app that transforms group chats into dynamic social gaming environments. Quest Masters (AI agents) analyze conversation patterns and create personalized challenges, turning everyday interactions into engaging quests with rewards and achievements.

## ✨ Features

### 🤖 AI Quest Masters
- **The Mentor**: Guides users through skill development and learning quests
- **The Competitor**: Creates competitive challenges and tournaments  
- **The Creator**: Fosters artistic and creative expression contests
- **The Connector**: Facilitates networking and relationship building
- **The Explorer**: Introduces users to new protocols and technologies

### 🎯 Dynamic Quest System
- **Real-time Quest Generation**: AI analyzes group conversations and creates contextual challenges
- **Multiple Quest Types**: Social challenges, knowledge quests, creative contests, community building, cross-protocol adventures
- **Difficulty Scaling**: Easy to Expert levels based on user experience
- **Reward System**: XP, tokens, badges, and achievements
- **Social Scoring**: Build reputation through quest participation

### 🚀 Mini App Integration
- **On-demand Deployment**: Interactive mini apps launch for each quest
- **Real-time Updates**: WebSocket-powered live quest notifications
- **Cross-group Challenges**: Network-wide events and competitions
- **Achievement System**: NFT badges and milestone rewards

## 🏗️ Architecture

### Backend (Node.js + XMTP)
- **XMTP Integration**: Group chat management and message streaming
- **AI Quest Masters**: LangChain-powered conversation analysis
- **Quest Orchestration**: Multi-agent coordination system
- **WebSocket Server**: Real-time quest updates
- **Mini App Launcher**: Dynamic quest deployment

### Frontend (Next.js + React)
- **Quest Dashboard**: Real-time quest display and management
- **Wallet Integration**: XMTP browser SDK with multiple wallet support
- **Responsive Design**: Mobile-first mini app experience
- **Real-time Updates**: WebSocket client for live notifications

## 🚀 Quick Start

### Prerequisites
- Node.js v20+
- Yarn v4.6.0+
- XMTP-compatible wallet

### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd miniapp/backend
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Generate XMTP keys**
   ```bash
   yarn gen:keys
   ```

4. **Set environment variables**
   ```bash
   # Add to .env file
   OPENAI_API_KEY=your_openai_api_key
   API_SECRET_KEY=your_api_secret
   PORT=3001
   ```

5. **Start the Quest Arena server**
   ```bash
   yarn dev
   ```

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd miniapp/frontend
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Set environment variables**
   ```bash
   # Add to .env.local
   NEXT_PUBLIC_API_SECRET=your_api_secret
   NEXT_PUBLIC_URL=http://localhost:3000
   ```

4. **Start the development server**
   ```bash
   yarn dev
   ```

## 🎮 How It Works

### 1. Conversation Monitoring
AI Quest Masters continuously analyze group chat conversations for:
- Activity patterns and engagement levels
- Topic trends and interests
- User interaction dynamics
- Optimal quest timing

### 2. Quest Generation
Based on analysis, Quest Masters create personalized challenges:
- **Social Challenges**: Community building, member recruitment
- **Knowledge Quests**: Learning challenges, trivia competitions  
- **Creative Contests**: Art, writing, meme competitions
- **Community Building**: Collaboration and networking tasks
- **Cross-Protocol**: Web3 exploration and adoption

### 3. Mini App Deployment
Each quest launches an interactive mini app with:
- Custom UI for quest type
- Real-time participation tracking
- Progress monitoring
- Reward distribution

### 4. Reward System
Participants earn:
- **XP**: Experience points for leveling up
- **Tokens**: Cryptocurrency rewards
- **Badges**: NFT achievements
- **Social Score**: Reputation building

## 🔧 API Endpoints

### Quest Management
- `GET /api/quests/active` - Get active quests
- `GET /api/quests/user/:inboxId/stats` - Get user statistics
- `POST /api/quests/trigger` - Manually trigger quest creation

### Group Management  
- `POST /api/xmtp/add-inbox` - Add user to group
- `POST /api/xmtp/remove-inbox` - Remove user from group
- `GET /api/xmtp/get-group-id` - Get group information

### WebSocket Events
- `questCreated` - New quest available
- `questCompleted` - Quest completion notification
- `userStats` - Updated user statistics

## 🎯 Quest Types

### Social Challenge 👥
- Member recruitment drives
- Community engagement contests
- Networking challenges
- Group activity boosters

### Knowledge Quest 🧠  
- Trivia competitions
- Learning challenges
- Skill assessments
- Educational content creation

### Creative Contest 🎨
- Art competitions
- Writing challenges
- Meme contests
- Design challenges

### Community Building 🏗️
- Collaboration projects
- Mentorship programs
- Event organization
- Resource sharing

### Cross-Protocol 🌐
- DeFi exploration
- NFT challenges
- Protocol adoption
- Web3 education

## 🏆 Achievement System

### Levels & XP
- **Level 1-10**: Novice (0-1000 XP)
- **Level 11-25**: Intermediate (1000-5000 XP)
- **Level 26-50**: Advanced (5000-15000 XP)
- **Level 51+**: Expert (15000+ XP)

### Badge Categories
- **Social**: Community building achievements
- **Creative**: Artistic and content creation
- **Knowledge**: Learning and education
- **Leadership**: Mentorship and guidance
- **Explorer**: Protocol and technology adoption

## 🔮 Future Roadmap

### Phase 1: Core Features ✅
- AI Quest Master system
- Basic quest types
- Reward mechanism
- Mini app framework

### Phase 2: Enhanced Gaming 🚧
- Leaderboards and competitions
- Guild system
- Advanced achievements
- Cross-group tournaments

### Phase 3: DeFi Integration 📋
- Token staking for quests
- NFT marketplace for badges
- DAO governance for quest approval
- Yield farming through participation

### Phase 4: Ecosystem Expansion 📋
- Multi-protocol support
- Third-party quest creators
- API for external integrations
- Mobile app development

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **XMTP Team**: For the amazing messaging protocol
- **LangChain**: For AI agent capabilities
- **Base**: For minikit inspiration and tools
- **Community**: For feedback and contributions

## 📞 Support

- **Discord**: [Join our community](https://discord.gg/xmtp)
- **Twitter**: [@xmtp_](https://twitter.com/xmtp_)
- **Documentation**: [docs.xmtp.org](https://docs.xmtp.org)

---

**Built with ❤️ for the XMTP community**

Transform your group chats into epic social adventures! 🚀