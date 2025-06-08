# XMTP Social Quest Arena

An innovative AI agent-powered mini-app that transforms group chats into dynamic social gaming experiences. Quest Master agents autonomously create personalized challenges, launch mini apps, and foster community engagement across the XMTP network.

## 🎯 Core Features

### AI Quest Masters
- **Autonomous Quest Generation**: AI agents analyze group dynamics and create personalized challenges
- **Dynamic Mini App Deployment**: Agents launch interactive experiences on-demand
- **Social Intelligence**: Agents adapt based on user engagement and preferences
- **Cross-Group Coordination**: Quest Masters collaborate to create network-wide events

### Interactive Mini Apps
- **Quest Dashboard**: Real-time challenge tracking and progress visualization
- **Social Leaderboards**: Cross-group competition and achievement systems
- **Challenge Arena**: Interactive mini-games and social activities
- **Achievement Gallery**: NFT-based accomplishment showcase

### Social Gaming Engine
- **Dynamic Challenges**: Personalized quests based on user behavior and interests
- **Team Formation**: AI-powered group matching for collaborative challenges
- **Reputation System**: Network-wide social proof and credibility tracking
- **Reward Mechanisms**: Token-based incentives and social recognition

## 🚀 Getting Started

This project combines XMTP messaging with AI agents and Farcaster Frames to create immersive social experiences.

### Repository Structure

- [frontend](./frontend): Next.js mini-app with Farcaster Frames integration
- [backend](./backend): Node.js server with XMTP agents and quest orchestration
- [agents](./agents): AI Quest Master implementations and social intelligence

### Requirements

- Node.js v20 or higher
- Yarn v4 or higher
- Docker (for local network testing)
- A Farcaster account (for Frames integration testing)
- OpenAI API key (for AI agent functionality)

### Backend Installation

Clone the repository and setup the backend:

```bash
# Clone repository
git clone https://github.com/xmtp/xmtp-social-quest-arena.git
# Navigate to backend directory
cd xmtp-social-quest-arena/backend
# Install dependencies
yarn install
# Create .env file
cp .env.example .env
# Generate xmtp env vars: WALLET_KEY and ENCRYPTION_KEY
yarn run gen:keys
# Run in development mode
yarn run dev
```

### Frontend Installation

Setup the frontend env vars:

```bash
# Navigate to frontend directory
cd xmtp-social-quest-arena/frontend
# Install dependencies
yarn install
# Create .env file
cp .env.example .env
# Run in development mode
yarn run dev
```

## 🎮 Core Experiences

### Quest Types
- **Social Challenges**: Group collaboration tasks and icebreakers
- **Knowledge Quests**: Trivia and learning-based competitions
- **Creative Contests**: Art, meme, and content creation challenges
- **Community Building**: Network growth and engagement activities
- **Cross-Protocol**: Multi-chain and DeFi integration challenges

### Agent Personalities
- **The Mentor**: Guides users through onboarding and skill development
- **The Competitor**: Creates competitive challenges and tournaments
- **The Creator**: Fosters artistic and creative expression
- **The Connector**: Facilitates networking and relationship building
- **The Explorer**: Introduces users to new protocols and technologies

## 🏆 Achievement System

### Individual Achievements
- **Quest Completion Badges**: Proof of challenge completion
- **Skill Mastery Tokens**: Expertise in specific areas
- **Social Impact Awards**: Community contribution recognition
- **Innovation Points**: Creative solution rewards

### Group Achievements
- **Team Victory Banners**: Collaborative success recognition
- **Community Builder Status**: Group growth and engagement metrics
- **Cross-Group Alliance**: Multi-community collaboration rewards

## 🔧 Technical Innovation

### AI Agent Architecture
- **Multi-Modal Intelligence**: Text, image, and interaction analysis
- **Social Graph Processing**: Network relationship understanding
- **Predictive Engagement**: Proactive challenge creation
- **Adaptive Learning**: Continuous improvement based on user feedback

### Mini App Integration
- **Frame-Native Design**: Optimized for Farcaster Frame interaction
- **Real-time Synchronization**: Live updates across all participants
- **Cross-Platform Compatibility**: Works across all XMTP-compatible clients
- **Scalable Architecture**: Supports thousands of concurrent users

### Blockchain Integration
- **Achievement NFTs**: Permanent record of accomplishments
- **Token Rewards**: Incentivization through cryptocurrency
- **Cross-Chain Support**: Multi-blockchain challenge integration
- **DeFi Integration**: Financial challenges and yield farming quests

## 🌟 Deployment & Production

### Generate Farcaster Manifest
1. Go to [Farcaster Developers > Manifest](https://warpcast.com/~/developers/mini-apps/manifest)
2. Insert your domain and generate the manifest
3. Update environment variables with account association data

### Environment Variables
```bash
NEXT_PUBLIC_URL="https://your-domain.com"
NEXT_PUBLIC_FARCASTER_HEADER="..." # accountAssociation.header
NEXT_PUBLIC_FARCASTER_PAYLOAD="..." # accountAssociation.payload
NEXT_PUBLIC_FARCASTER_SIGNATURE="..." # accountAssociation.signature
OPENAI_API_KEY="..." # For AI agent functionality
```

## 🧪 Local Development

### Using Local XMTP Network
```bash
./dev/up
```

Set `.env` files to use local network:
```bash
XMTP_ENV=local
```

### Common Issues
- **Frontend/Backend Sync**: Ensure both use same XMTP_ENV
- **Agent Response Delays**: Check OpenAI API rate limits
- **Frame Loading Issues**: Verify Farcaster manifest configuration

## 📚 Additional Resources

- [XMTP Documentation](https://docs.xmtp.org)
- [Farcaster MiniApps Documentation](https://miniapps.farcaster.xyz/docs/getting-started)
- [Farcaster Frames Documentation](https://docs.farcaster.xyz/reference/frames/spec)
- [AI Agent Development Guide](https://docs.openai.com/guides/agents)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to get involved.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.