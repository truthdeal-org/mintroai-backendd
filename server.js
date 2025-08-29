require('dotenv').config()
const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const cors = require('cors')
const bodyParser = require('body-parser')
const { ethers } = require('ethers')

const app = express()

// Middleware
app.use(cors())
app.use(bodyParser.json())

// Memory store for configurations
const configurations = {}

// Create HTTP server
const server = http.createServer(app)

// Create WebSocket server
const wss = new WebSocket.Server({ server })

// Listen for WebSocket connections
wss.on('connection', (ws) => {
  console.log('New WebSocket client connected')

  ws.send(JSON.stringify({ message: 'Welcome to the WebSocket server!' }))

  ws.on('message', (message) => {
    console.log('Received via WebSocket:', message.toString())
  })

  ws.on('close', () => {
    console.log('WebSocket client disconnected')
  })
})

// Broadcast function
const broadcast = (data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data))
    }
  })
}

// ============================================
// CHAIN SIGNATURES FUNDING ENDPOINTS
// ============================================

// Network configurations for Chain Signatures
const NETWORK_CONFIGS = {
  '97': { // BSC Testnet
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    fundingAmount: '0.0025', // in BNB
    name: 'BSC Testnet'
  },
  '1313161555': { // Aurora Testnet
    rpcUrl: 'https://testnet.aurora.dev',
    fundingAmount: '0.0025', // in ETH
    name: 'Aurora Testnet'
  }
}

/**
 * Fund a derived address for Chain Signatures
 * POST /api/fund-address
 * Body: {
 *   address: string - The derived address to fund
 *   chainId: string - The target chain ID
 * }
 */
app.post('/api/fund-address', async (req, res) => {
  try {
    const { address, chainId } = req.body

    // Validation
    if (!address || !chainId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: address and chainId' 
      })
    }

    // Check if address is valid
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ 
        error: 'Invalid Ethereum address' 
      })
    }

    // Get network config
    const networkConfig = NETWORK_CONFIGS[chainId]
    if (!networkConfig) {
      return res.status(400).json({ 
        error: `Unsupported chain ID: ${chainId}` 
      })
    }

    // Check if funder private key exists
    const funderPrivateKey = process.env.NEXT_PUBLIC_FUNDER_PRIVATE_KEY
    if (!funderPrivateKey) {
      console.error('NEXT_PUBLIC_FUNDER_PRIVATE_KEY not configured in environment')
      return res.status(500).json({ 
        error: 'Funding service not configured. Please contact administrator.' 
      })
    }

    // Create provider and wallet
    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl)
    const funderWallet = new ethers.Wallet(funderPrivateKey, provider)

    // Check funder balance
    const funderBalance = await provider.getBalance(funderWallet.address)
    const fundingAmount = ethers.parseEther(networkConfig.fundingAmount)

    if (funderBalance < fundingAmount) {
      console.error(`Insufficient funder balance. Required: ${networkConfig.fundingAmount}, Available: ${ethers.formatEther(funderBalance)}`)
      return res.status(500).json({ 
        error: 'Funding service temporarily unavailable. Insufficient balance.' 
      })
    }

    // Check if address already has sufficient balance
    const addressBalance = await provider.getBalance(address)
    const minimumBalance = fundingAmount / 2n // Half of funding amount as minimum

    if (addressBalance >= minimumBalance) {
      console.log(`Address ${address} already has sufficient balance: ${ethers.formatEther(addressBalance)}`)
      return res.status(200).json({
        success: true,
        message: 'Address already has sufficient balance',
        balance: ethers.formatEther(addressBalance),
        funded: false
      })
    }

    // Send funding transaction
    console.log(`Funding address ${address} on ${networkConfig.name} with ${networkConfig.fundingAmount} ETH/BNB`)
    
    const tx = await funderWallet.sendTransaction({
      to: address,
      value: fundingAmount
    })

    console.log(`Funding transaction sent: ${tx.hash}`)

    // Wait for confirmation
    const receipt = await tx.wait(1)

    // Broadcast funding event
    broadcast({
      type: 'addressFunded',
      address,
      chainId,
      amount: networkConfig.fundingAmount,
      txHash: tx.hash
    })

    return res.status(200).json({
      success: true,
      message: `Successfully funded ${address} with ${networkConfig.fundingAmount} on ${networkConfig.name}`,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      funded: true
    })

  } catch (error) {
    console.error('Funding error:', error)
    
    // Handle specific error types
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return res.status(500).json({ 
        error: 'Funder wallet has insufficient balance' 
      })
    }
    
    if (error.code === 'NETWORK_ERROR') {
      return res.status(500).json({ 
        error: 'Network connection error. Please try again.' 
      })
    }

    return res.status(500).json({ 
      error: 'Failed to fund address', 
      details: error.message 
    })
  }
})

/**
 * Check address balance
 * GET /api/check-balance
 * Query: address, chainId
 */
app.get('/api/check-balance', async (req, res) => {
  try {
    const { address, chainId } = req.query

    if (!address || !chainId) {
      return res.status(400).json({ 
        error: 'Missing required parameters: address and chainId' 
      })
    }

    const networkConfig = NETWORK_CONFIGS[chainId]
    if (!networkConfig) {
      return res.status(400).json({ 
        error: `Unsupported chain ID: ${chainId}` 
      })
    }

    const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl)
    const balance = await provider.getBalance(address)

    return res.status(200).json({
      success: true,
      address,
      chainId,
      balance: ethers.formatEther(balance),
      network: networkConfig.name
    })

  } catch (error) {
    console.error('Balance check error:', error)
    return res.status(500).json({ 
      error: 'Failed to check balance', 
      details: error.message 
    })
  }
})

/**
 * Get funding status and statistics
 * GET /api/funding-status
 */
app.get('/api/funding-status', async (req, res) => {
  try {
    const funderPrivateKey = process.env.NEXT_PUBLIC_FUNDER_PRIVATE_KEY
    
    if (!funderPrivateKey) {
      return res.status(200).json({
        configured: false,
        message: 'Funding service not configured'
      })
    }

    const funderWallet = new ethers.Wallet(funderPrivateKey)
    const funderAddress = funderWallet.address

    // Check balance on all networks
    const balances = {}
    for (const [chainId, config] of Object.entries(NETWORK_CONFIGS)) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl)
        const balance = await provider.getBalance(funderAddress)
        balances[chainId] = {
          network: config.name,
          balance: ethers.formatEther(balance),
          fundingAmount: config.fundingAmount,
          canFund: balance >= ethers.parseEther(config.fundingAmount)
        }
      } catch (error) {
        balances[chainId] = {
          network: config.name,
          error: 'Failed to check balance'
        }
      }
    }

    return res.status(200).json({
      configured: true,
      funderAddress,
      balances
    })

  } catch (error) {
    console.error('Status check error:', error)
    return res.status(500).json({ 
      error: 'Failed to check funding status' 
    })
  }
})

// ============================================
// ORIGINAL ENDPOINTS
// ============================================

// API Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    services: {
      websocket: wss.clients.size + ' clients connected',
      funding: process.env.NEXT_PUBLIC_FUNDER_PRIVATE_KEY ? 'configured' : 'not configured'
    }
  })
})

// Get configuration
app.get('/config', (req, res) => {
  const { chatId } = req.query

  if (!chatId) {
    return res.status(400).json({ message: 'chatId is required.' })
  }

  const config = configurations[chatId]

  if (!config) {
    return res
      .status(404)
      .json({ message: `No configuration found for chatId: ${chatId}` })
  }

  return res.status(200).json({
    message: 'Configuration retrieved successfully!',
    data: config,
  })
})

// Set configuration
app.post('/config', (req, res) => {
  const { chatId, config } = req.body

  if (!chatId || !config) {
    return res.status(400).json({ message: 'chatId and config are required.' })
  }

  configurations[chatId] = config

  // Broadcast the configuration update to WebSocket clients
  broadcast({
    type: 'configUpdated',
    chatId,
    config,
  })

  console.log('Config saved for:', chatId, 'config:', configurations[chatId])
  return res.status(200).json({
    message: 'Configuration has been successfully saved!',
    data: configurations[chatId],
  })
})

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const payload = req.body

  // Broadcast the webhook data to WebSocket clients
  broadcast({
    type: 'webhookReceived',
    data: payload,
  })

  res.status(200).json({ message: 'Webhook processed and broadcasted' })
})

// Start the server
const PORT = process.env.PORT || 3005
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║          MintroAI Backend Server               ║
╠════════════════════════════════════════════════╣
║  Server running on port: ${PORT}                  ║
║  WebSocket: ws://localhost:${PORT}                ║
║  Health: http://localhost:${PORT}/health          ║
║                                                ║
║  Chain Signatures Funding:                    ║
║  - POST /api/fund-address                     ║
║  - GET  /api/check-balance                    ║
║  - GET  /api/funding-status                   ║
╚════════════════════════════════════════════════╝
  `)
  
  // Check funding configuration
  if (process.env.NEXT_PUBLIC_FUNDER_PRIVATE_KEY) {
    console.log('✅ Funding service configured')
  } else {
    console.log('⚠️  WARNING: NEXT_PUBLIC_FUNDER_PRIVATE_KEY not set - funding service disabled')
  }
})

module.exports = { broadcast, configurations }
