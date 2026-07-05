require('dotenv').config()

const port = process.env.PORT || 8000
const express = require('express')
const path = require("path")
const cookieParser = require('cookie-parser')
const cors = require('cors')
const helmet = require('helmet')
const sanitizeHtml = require('sanitize-html')
const { MAX_MESSAGE_LENGTH } = require('./constants')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/chatapp").then(() => console.log("✅ MongoDB connected"))

// In-memory rate limiter for socket messages
const socketRateLimits = new Map()
const SOCKET_MSG_LIMIT = 30 // max messages
const SOCKET_MSG_WINDOW = 10 * 1000 // per 10 seconds

function isSocketRateLimited(userId) {
    const now = Date.now()
    if (!socketRateLimits.has(userId)) {
        socketRateLimits.set(userId, [])
    }
    const timestamps = socketRateLimits.get(userId).filter(t => now - t < SOCKET_MSG_WINDOW)
    if (timestamps.length >= SOCKET_MSG_LIMIT) {
        socketRateLimits.set(userId, timestamps)
        return true
    }
    timestamps.push(now)
    socketRateLimits.set(userId, timestamps)
    return false
}

// In-memory presence tracking: room -> Map<username, connectionCount>
// A count (not a plain Set) so a user with multiple tabs open to the same
// room only goes "offline" once their last connection closes
const roomPresence = new Map()

function addPresence(io, room, username) {
    if (!roomPresence.has(room)) roomPresence.set(room, new Map())
    const users = roomPresence.get(room)
    const count = users.get(username) || 0
    users.set(username, count + 1)
    if (count === 0) {
        io.to(room).emit('presence update', { room, username, online: true })
    }
}

function removePresence(io, room, username) {
    const users = roomPresence.get(room)
    if (!users || !users.has(username)) return
    const count = users.get(username)
    if (count <= 1) {
        users.delete(username)
        io.to(room).emit('presence update', { room, username, online: false })
    } else {
        users.set(username, count - 1)
    }
}

function getOnlineUsers(room) {
    const users = roomPresence.get(room)
    return users ? [...users.keys()] : []
}

// Add connection monitoring
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err)
})

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected')
})

const staticRoute = require("./routes/static")
const chatRoute = require("./routes/chat")
const { createServer } = require("node:http")
const { Server } = require("socket.io")

const Message = require("./models/message")
const uploadService = require("./services/uploadService")
const app = express()
const server = createServer(app)

// Render sits in front of this app as a single reverse proxy hop - trust
// exactly that hop so req.ip (and express-rate-limit's client key) reflects
// the real client IP instead of the proxy's
app.set('trust proxy', 1)

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

const io = new Server(server, {
    cors: corsOptions,
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000
    }
})

if (process.env.NODE_ENV === 'production') {
    console.log(`CORS enabled for: ${allowedOrigins.join(', ')}`)
}

// crossOriginResourcePolicy is relaxed to cross-origin since uploaded files
// are embedded (img/video/pdf) directly from the separately-hosted frontend
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

app.use(cors(corsOptions))

// Health check endpoint (for uptime monitoring)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, uploadService.UPLOAD_DIR)))

app.use(express.urlencoded({ extended: true }))
app.use(express.json());
app.use(cookieParser());

// Add request logging for debugging
const SENSITIVE_BODY_FIELDS = ['password']

app.use((req, res, next) => {
    console.log(`🌐 ${req.method} ${req.path}`)
    if (req.body && Object.keys(req.body).length > 0) {
        const safeBody = { ...req.body }
        for (const field of SENSITIVE_BODY_FIELDS) {
            if (field in safeBody) safeBody[field] = '[REDACTED]'
        }
        console.log('📦 Request body:', safeBody)
    }
    next()
})

// Make io accessible to routes
app.set('io', io)

app.use("/", staticRoute)
app.use("/chat", chatRoute)

console.log('📋 Routes loaded:')
console.log('  ✅ Static routes: /')
console.log('  ✅ Chat routes: /chat')

// Handle unmatched routes
app.get('*', (req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' })
})

const Room = require("./models/room")
const ReadReceipt = require("./models/readReceipt")
const { verifyToken } = require("./middleware/auth")

const HISTORY_PAGE_SIZE = 50

// Mark a room as read (up to now) for a user
async function markRoomRead(username, room) {
    await ReadReceipt.findOneAndUpdate(
        { username, room },
        { $set: { lastReadAt: new Date() } },
        { upsert: true }
    )
}

// A message is considered "seen by all" once its createdAt is at or before this
// cutoff. Members currently online are treated as reading live (effective read
// time = now); offline members contribute their last recorded lastReadAt. The
// cutoff is the earliest of those, since that's the slowest member in the room.
async function computeSeenCutoff(room, members) {
    const online = new Set(getOnlineUsers(room))
    const offlineMembers = members.filter(m => !online.has(m))

    if (offlineMembers.length === 0) {
        return new Date()
    }

    const receipts = await ReadReceipt.find({ username: { $in: offlineMembers }, room })
    const lastReadMap = new Map(receipts.map(r => [r.username, r.lastReadAt]))

    let cutoff = new Date()
    for (const member of offlineMembers) {
        const readAt = lastReadMap.get(member) || new Date(0)
        if (readAt < cutoff) cutoff = readAt
    }
    return cutoff
}

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

            // Track presence and hand back who's currently online in this room
            addPresence(io, room, username)
            socket.emit('presence list', { room, onlineUsers: getOnlineUsers(room) })

            // Get most recent page of messages
            const prevMessages = await Message.find({ room }).sort({ _id: -1 }).limit(HISTORY_PAGE_SIZE)
            prevMessages.reverse()
            socket.emit("prev", {
                messages: prevMessages,
                hasMore: prevMessages.length === HISTORY_PAGE_SIZE
            })

            // Opening the room counts as reading everything currently in it
            await markRoomRead(username, room)

            // This member coming online/reading can only advance (never rewind)
            // the room's "seen by all" cutoff - recompute and broadcast it
            const seenCutoff = await computeSeenCutoff(room, roomDoc.members)
            io.to(room).emit('seen update', { room, cutoff: seenCutoff })

        } catch (error) {
            console.error('Join room error:', error)
            socket.emit('join error', { message: 'Server error' })
        }
    })

    // Load an older page of messages for infinite-scroll history
    socket.on('load older messages', async ({ room, before }) => {
        try {
            if (!room || !before) {
                socket.emit('error', { message: 'Room and before cursor are required' })
                return
            }

            const roomDoc = await Room.findOne({ name: room })
            if (!roomDoc || !roomDoc.members.includes(socket.authenticatedUser)) {
                socket.emit('error', { message: 'Access denied to room history' })
                return
            }

            const olderMessages = await Message.find({ room, _id: { $lt: before } })
                .sort({ _id: -1 })
                .limit(HISTORY_PAGE_SIZE)
            olderMessages.reverse()

            socket.emit('older messages', {
                messages: olderMessages,
                hasMore: olderMessages.length === HISTORY_PAGE_SIZE
            })
        } catch (error) {
            console.error('Load older messages error:', error)
            socket.emit('error', { message: 'Server error loading history' })
        }
    })

    socket.on("chat message", async (data) => {
        // ⚡ Latency measurement: capture server receive time
        const serverReceiveTime = Date.now()

        // Rate limit socket messages
        if (isSocketRateLimited(socket.authenticatedUser)) {
            socket.emit('error', { message: 'You are sending messages too fast. Please slow down.' })
            return
        }

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

        if (typeof data.message !== 'string') {
            socket.emit('error', { message: 'Message cannot be empty' })
            return
        }

        if (data.message.length > MAX_MESSAGE_LENGTH) {
            socket.emit('error', { message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters` })
            return
        }

        // Sanitize message content to prevent XSS
        const cleanMessage = sanitizeHtml(data.message, { allowedTags: [], allowedAttributes: {} })
        if (!cleanMessage.trim()) {
            socket.emit('error', { message: 'Message cannot be empty' })
            return
        }

        const newMessage = await Message.create({
            username: data.username,
            room: data.room,
            message: cleanMessage
        })

        // ⚡ Calculate server processing time
        const serverProcessingTime = Date.now() - serverReceiveTime
        console.log(`⚡ Message saved | Server processing: ${serverProcessingTime}ms`)

        io.to(data.room).emit("chat message", {
            _id: newMessage._id,
            username: data.username,
            message: cleanMessage,
            createdAt: newMessage.createdAt,
            // ⚡ Latency measurement data
            clientSendTime: data.clientSendTime, // Pass through for round-trip calculation
            serverProcessingTime: serverProcessingTime
        })

        // Recompute "seen by all" - members who are still online right now
        // are treated as reading live, so this can cover the message just sent
        const seenCutoff = await computeSeenCutoff(data.room, roomDoc.members)
        io.to(data.room).emit('seen update', { room: data.room, cutoff: seenCutoff })
    })

    // ⚡ Benchmark: echo-back for RTT measurement
    socket.on('ping_bench', (data) => {
        socket.emit('pong_bench', data)
    })

    // Mark rooms as read and clear presence while socket.rooms is still
    // populated, since Socket.io clears it before the 'disconnect' event fires
    socket.on('disconnecting', async () => {
        const joinedRooms = [...socket.rooms].filter(r => r !== socket.id)
        if (socket.authenticatedUser && joinedRooms.length > 0) {
            for (const room of joinedRooms) {
                removePresence(io, room, socket.authenticatedUser)
            }
            await Promise.all(joinedRooms.map(room => markRoomRead(socket.authenticatedUser, room)))
        }
    })

    // Handle socket disconnection
    socket.on('disconnect', () => {
        console.log(`❌ User disconnected: ${socket.authenticatedUser}`)
        // Socket.io automatically removes socket from all rooms on disconnect
    })
})


server.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`)
    console.log(`📱 Frontend dev server: http://localhost:3000`)
    console.log(`🔌 Socket.io ready for connections`)
})







