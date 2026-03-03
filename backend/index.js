require('dotenv').config()

const port = process.env.PORT || 8000
const express = require('express')
const path = require("path")
const cookieParser = require('cookie-parser')
const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp").then(() => console.log("✅ MongoDB connected"))

// Add connection monitoring
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err)
})

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected')
})

const staticRoute = require("./routes/static")
const chatRoute = require("./routes/chat")
const {createServer}  = require("node:http")
const {Server} = require("socket.io")

const Message = require("./models/message")
const app = express()
const server = createServer(app)

// CORS configuration - environment-aware
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true)
        if (allowedOrigins.some(allowed => origin === allowed.trim())) {
            callback(null, true)
        } else {
            console.log(`❌ CORS blocked origin: ${origin}`)
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}

const io = new Server(server,{
    cors: corsOptions,
    connectionStateRecovery : {
        maxDisconnectionDuration : 2 * 60 * 1000
    }
})

if (process.env.NODE_ENV === 'production') {
    console.log(`CORS enabled for: ${allowedOrigins.join(', ')}`)
}

app.use(cors(corsOptions))

// Health check endpoint (for uptime monitoring)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.use(express.urlencoded({ extended : true}))
app.use(express.json());
app.use(cookieParser());

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path}`)
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Request body:', req.body)
  }
  next()
})

// Make io accessible to routes
app.set('io', io)

app.use("/" ,staticRoute)
app.use("/chat",chatRoute)

console.log('📋 Routes loaded:')
console.log('  ✅ Static routes: /')
console.log('  ✅ Chat routes: /chat')

// Handle unmatched routes
app.get('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' })
})

const Room = require("./models/room")
const { verifyToken } = require("./middleware/auth")

// Socket.io authentication middleware
io.use((socket, next) => {
    const cookies = socket.handshake.headers.cookie
    
    if (!cookies) {
        return next(new Error('Authentication required'))
    }
    
    // Parse cookies safely to extract authToken
    const cookieObj = {}
    cookies.split(';').forEach(cookie => {
        const [key, value] = cookie.trim().split('=')
        if (key && value) {
            cookieObj[key.trim()] = decodeURIComponent(value)
        }
    })
    
    const token = cookieObj.authToken
    
    if (!token) {
        return next(new Error('Authentication token not found'))
    }
    
    // Verify token
    const decoded = verifyToken(token)
    
    if (!decoded) {
        return next(new Error('Invalid authentication token'))
    }
    
    // Store authenticated username in socket
    socket.authenticatedUser = decoded.username
    next()
})

io.on("connection", (socket) => {
    console.log(`✅ User connected: ${socket.authenticatedUser}`)
    
    socket.on('join room', async ({ username, room }) => {
        // Verify that the username matches the authenticated user
        if (username !== socket.authenticatedUser) {
            socket.emit('join error', { message: 'Username mismatch - authentication failed' })
            return
        }
        try {
            // Check if room exists and user has permission
            const roomDoc = await Room.findOne({ name: room })
            
            if (!roomDoc) {
                socket.emit('join error', { message: 'Room not found' })
                return
            }

            // Block banned users (public or private)
            if (roomDoc.bannedMembers && roomDoc.bannedMembers.includes(username)) {
                socket.emit('join error', { message: 'You are banned from this room' })
                return
            }
            
            // Check private room access
            if (roomDoc.isPrivate && !roomDoc.members.includes(username)) {
                socket.emit('join error', { message: 'Access denied to private room' })
                return
            }
            
            // Join the room
            socket.join(room)
            
            // Notify user of successful join
            socket.emit('join success', { message: `Joined room ${room}` })
            
            // Notify others in room
            io.to(room).emit('user joined', { username, message: `${username} joined the room` })
            
            // Get previous messages
            const prevMessages = await Message.find({ room }).sort({ createdAt: -1 }).limit(50)
            prevMessages.reverse()
            socket.emit("prev", prevMessages)
            
        } catch (error) {
            console.error('Join room error:', error)
            socket.emit('join error', { message: 'Server error' })
        }
    })
    
    socket.on("chat message", async (data) => {
        // ⚡ Latency measurement: capture server receive time
        const serverReceiveTime = Date.now()
        
        // Verify that the username matches the authenticated user
        if (data.username !== socket.authenticatedUser) {
            socket.emit('error', { message: 'Username mismatch - authentication failed' })
            return
        }

        // Validate room and membership/bans before allowing message
        const roomDoc = await Room.findOne({ name: data.room })
        if (!roomDoc) {
            socket.emit('error', { message: 'Room not found' })
            return
        }
        if (roomDoc.bannedMembers && roomDoc.bannedMembers.includes(data.username)) {
            socket.emit('error', { message: 'You are banned from this room' })
            return
        }
        if (!roomDoc.members.includes(data.username)) {
            socket.emit('error', { message: 'You must join the room before sending messages' })
            return
        }

        const newMessage = await Message.create({
            username : data.username,
            room : data.room,
            message : data.message
        })
        
        // ⚡ Calculate server processing time
        const serverProcessingTime = Date.now() - serverReceiveTime
        console.log(`⚡ Message saved | Server processing: ${serverProcessingTime}ms`)
        
        io.to(data.room).emit("chat message" ,{
            _id: newMessage._id,
            username : data.username,
            message : data.message,
            createdAt: newMessage.createdAt,
            // ⚡ Latency measurement data
            clientSendTime: data.clientSendTime, // Pass through for round-trip calculation
            serverProcessingTime: serverProcessingTime
        })
    })

    // Handle socket disconnection
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.authenticatedUser}`)
        // Socket.io automatically removes socket from all rooms on disconnect
    })
})


server.listen(port,() => {
    console.log(`🚀 Server running on http://localhost:${port}`)
    console.log(`📱 Frontend dev server: http://localhost:3000`)
    console.log(`🔌 Socket.io ready for connections`)
})







