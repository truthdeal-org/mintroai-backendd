require('dotenv').config()
const express = require('express')
const WebSocket = require('ws')
const http = require('http')
const cors = require('cors')
const bodyParser = require('body-parser')

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

// API Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
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
  console.log(`Server is running on port ${PORT}`)
  console.log(`WebSocket server is available`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})

module.exports = { broadcast, configurations } 