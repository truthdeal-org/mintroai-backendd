# MintroAI Backend Server

Backend service for MintroAI dApp with Chain Signatures funding support.

## Features

- 🔐 **Secure Funding Service** - Private key management on backend only
- 🌐 **WebSocket Support** - Real-time communication
- 💰 **Multi-Chain Support** - BSC, Aurora, Arbitrum
- 📊 **Balance Monitoring** - Check funding status
- 🔄 **Configuration Management** - Dynamic config updates

## Installation

```bash
# Clone the repository
git clone <your-backend-repo>
cd mintroai-backend

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env and add your FUNDER_PRIVATE_KEY
```

## Environment Variables

Create a `.env` file with:

```env
# Server Configuration
PORT=3005

# Chain Signatures Funding
FUNDER_PRIVATE_KEY=your_private_key_here

# Optional: Network-specific keys
# FUNDER_PRIVATE_KEY_BSC=your_bsc_key
# FUNDER_PRIVATE_KEY_AURORA=your_aurora_key
# FUNDER_PRIVATE_KEY_ARBITRUM=your_arbitrum_key
```

## Running the Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## API Endpoints

### Chain Signatures Funding

#### Fund Address
```http
POST /api/fund-address
Content-Type: application/json

{
  "address": "0x...",
  "chainId": "97"
}
```

#### Check Balance
```http
GET /api/check-balance?address=0x...&chainId=97
```

#### Funding Status
```http
GET /api/funding-status
```

### Configuration Management

#### Get Config
```http
GET /config?chatId=xxx
```

#### Set Config
```http
POST /config
Content-Type: application/json

{
  "chatId": "xxx",
  "config": {...}
}
```

### Health Check
```http
GET /health
```

## Supported Networks

| Network | Chain ID | Funding Amount |
|---------|----------|----------------|
| BSC Testnet | 97 | 0.0025 BNB |
| Aurora Testnet | 1313161555 | 0.0025 ETH |
| Arbitrum | 42161 | 0.001 ETH |

## WebSocket

Connect to `ws://localhost:3005` for real-time updates.

### Events:
- `configUpdated` - Configuration changes
- `addressFunded` - Funding completed
- `webhookReceived` - Webhook data

## Security

⚠️ **Important Security Notes:**

1. **NEVER** expose private keys in frontend code
2. **NEVER** commit `.env` file to git
3. **Always** validate incoming requests
4. **Use** HTTPS in production
5. **Implement** rate limiting for production

## Docker Support

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3005
CMD ["node", "server.js"]
```

## License

MIT
