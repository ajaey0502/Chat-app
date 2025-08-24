# Chat Application Project Documentation

## **Project Overview**
This is a **real-time chat application** built with a **MERN stack** (MongoDB, Express.js, React, Node.js) using **Socket.io** for real-time communication. Users can create accounts, join rooms, and chat with other users in public or private rooms.

## **Architecture**

### **Backend (Node.js/Express)**
- **Server**: Express.js with Socket.io integration
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT tokens stored in HTTP-only cookies
- **Real-time**: Socket.io for live messaging

### **Frontend (React/Vite)**
- **Framework**: React with Vite as build tool
- **Routing**: React Router for navigation
- **State**: React hooks for local state management
- **Styling**: Custom CSS with responsive design

## **Core Features**

### **1. Authentication System**
- **Signup/Login**: JWT-based authentication
- **Session Management**: HTTP-only cookies for security
- **Auto-login**: Persistent sessions across browser refreshes
- **Logout**: Secure token cleanup

### **2. Room Management**
- **Public Rooms**: Open to all users
- **Private Rooms**: Invitation-only access
- **Room Creation**: Users can create new rooms
- **Ownership**: Room creators have admin privileges
- **Member Management**: Add/remove users from private rooms

### **3. Real-time Messaging**
- **Live Chat**: Instant message delivery via Socket.io
- **Message History**: Previous messages loaded on room join
- **Message Editing**: Edit your own messages with real-time updates
- **Message Deletion**: Remove messages with confirmation
- **File Sharing**: Upload and share images/videos

### **4. User Interface**
- **Dashboard**: Room browser and management interface
- **Chat Interface**: Clean messaging UI with user actions
- **Responsive Design**: Mobile-friendly layouts
- **Loading States**: User feedback during operations

## **Technical Implementation**

### **Database Models**
```javascript
// User Model
{
  username: String (unique),
  password: String,
  rooms: [String]
}

// Room Model  
{
  name: String (unique),
  isPrivate: Boolean,
  owner: String,
  members: [String],
  timestamps: true
}

// Message Model
{
  username: String,
  message: String,
  room: String,
  createdAt: Date,
  edited: Boolean,
  fileUrl: String,
  fileType: String,
  fileName: String
}
```

### **Authentication Flow**
1. **Login** → JWT generated → Stored in HTTP-only cookie
2. **API Requests** → Cookie sent automatically → JWT verified by middleware
3. **Frontend State** → User state managed for UI decisions
4. **Logout** → Cookie cleared → State reset

### **Socket.io Implementation**
```javascript
// Server-side Socket.io events
io.on("connection", (socket) => {
    // Room joining with permission checks
    socket.on('join room', async ({ username, room }) => {
        try {
            // Check if room exists and user has permission
            const roomDoc = await Room.findOne({ name: room })
            
            if (!roomDoc) {
                socket.emit('join error', { message: 'Room not found' })
                return
            }
            
            // Check private room access
            if (roomDoc.isPrivate && !roomDoc.members.includes(username)) {
                socket.emit('join error', { message: 'Access denied to private room' })
                return
            }
            
            // Join the room
            socket.join(room)
            
            // Get previous messages (last 50)
            const prevMessages = await Message.find({ room })
                .sort({ createdAt: -1 })
                .limit(50)
            prevMessages.reverse()
            socket.emit("prev", prevMessages)
            
        } catch (error) {
            console.error('Join room error:', error)
            socket.emit('join error', { message: 'Server error' })
        }
    })

    // Real-time message handling
    socket.on("chat message", async (data) => {
        const newMessage = await Message.create({
            username: data.username,
            room: data.room,
            message: data.message
        })
        
        // Broadcast to all users in the room
        io.to(data.room).emit("chat message", {
            _id: newMessage._id,
            username: data.username,
            message: data.message
        })
    })
})
```

### **Real-time Communication**
1. **User joins room** → Socket.io connection established → Permission verified
2. **Message sent** → Saved to MongoDB → Broadcasted to room members
3. **Message edited/deleted** → Database updated → Real-time sync to all clients
4. **File uploads** → Stored locally → URL saved in message → Shared in real-time

### **Security Features**
- **JWT Authentication** with secure cookie storage
- **Private Room Access Control** based on membership verification
- **File Upload Validation** (images/videos only, 50MB limit)
- **CORS Protection** for cross-origin requests
- **Input Validation** on both frontend and backend
- **Room Permission Checks** before allowing Socket.io room joins

## **Server Configuration**

### **Express Server Setup**
```javascript
const app = express()
const server = createServer(app)
const io = new Server(server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000  // 2 minutes
    }
})

// CORS configuration for development
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}))

// Static file serving
app.use(express.static(path.join(__dirname, 'dist')))  // React build
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))  // File uploads

// Make Socket.io accessible to routes
app.set('io', io)
```

### **Database Connection**
```javascript
mongoose.connect("mongodb://localhost:27017/chatapp")
    .then(() => console.log("✅ MongoDB connected"))

// Connection monitoring
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err)
})
```

## **Project Structure**
```
chat-app-REACT/
├── controllers/
│   └── user.js                 # Authentication logic (login, signup)
├── middleware/
│   └── auth.js                 # JWT verification middleware
├── models/
│   ├── user.js                 # User schema
│   ├── room.js                 # Room schema
│   └── message.js              # Message schema
├── routes/
│   ├── static.js               # Authentication routes (/api/*)
│   └── chat.js                 # Chat and room management routes (/chat/*)
├── services/
│   └── uploadService.js        # File upload handling
├── src/
│   ├── components/
│   │   ├── Chat.jsx            # Main chat interface
│   │   ├── Dashboard.jsx       # Room browser and management
│   │   ├── Login.jsx           # Login form
│   │   ├── Signup.jsx          # Registration form
│   │   ├── MessageList.jsx     # Message display container
│   │   ├── Message.jsx         # Individual message component
│   │   └── MessageForm.jsx     # Message input form
│   ├── App.jsx                 # Main app with routing
│   └── main.jsx                # React entry point
├── uploads/                    # File storage directory
├── index.js                    # Main server file
└── package.json               # Dependencies and scripts
```

## **API Endpoints**

### **Authentication Routes (`/api/*`)**
- `POST /api/signup` - User registration
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/me` - Get current user info

### **Chat Routes (`/chat/*`)**
- `GET /chat/rooms` - Get available rooms
- `GET /chat/room-info` - Get specific room details
- `GET /chat/?room=<name>` - Join/access a room
- `POST /chat/createRoom` - Create new room
- `POST /chat/add-member` - Add members to private room
- `POST /chat/leaveRoom` - Leave a room
- `POST /chat/editMessage` - Edit a message
- `POST /chat/deleteMessage` - Delete a message
- `POST /chat/upload` - Upload files
- `GET /chat/uploads/:filename` - Serve uploaded files

## **Socket.io Events**

### **Client to Server**
- `join room` - Join a chat room
- `chat message` - Send a message

### **Server to Client**
- `join error` - Room join failed
- `prev` - Previous message history
- `chat message` - New message received
- `message edited` - Message was edited
- `message deleted` - Message was deleted

## **Key Technologies**
- **Backend**: Node.js, Express.js, MongoDB, Socket.io, JWT, Multer
- **Frontend**: React, Vite, React Router, Socket.io-client
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT with HTTP-only cookies
- **Real-time**: Socket.io for bidirectional communication
- **File Handling**: Multer for uploads, static serving

## **Development Setup**

### **Prerequisites**
- Node.js (v14+)
- MongoDB (running on localhost:27017)
- npm or yarn package manager

### **Installation**
```bash
# Clone the repository
git clone <repository-url>
cd chat-app-REACT

# Install dependencies
npm install

# Start MongoDB (if not already running)
mongod

# Start the development server
npm run dev
```

### **Development Ports**
- **Backend**: Port 8000 (Express server + Socket.io)
- **Frontend**: Port 3000 (Vite dev server)
- **Database**: MongoDB on localhost:27017

### **Environment Configuration**
```javascript
// Development
- CORS enabled for localhost:3000
- JWT secret: 'your-secret-key-change-in-production'
- File uploads: local filesystem

// Production  
- Serve React build from Express
- Secure cookies enabled
- Static file serving optimized
```

## **Production Features**
- **Static File Serving**: React build files served by Express
- **Route Handling**: Catch-all route for React Router compatibility
- **Environment Detection**: Different behavior for development vs production
- **File Upload Storage**: Local filesystem with static serving
- **Connection Recovery**: Socket.io reconnection handling

## **User Experience Flow**

### **1. Authentication**
1. User visits application → Redirected to login
2. Registration/Login → JWT token created and stored in HTTP-only cookie
3. Token verified → Access granted to dashboard

### **2. Room Management**
1. Dashboard displays available rooms (public + joined private)
2. User can create new rooms (public/private)
3. Room owners can add members to private rooms
4. Users can join public rooms or invited private rooms

### **3. Real-time Chat**
1. User joins room → Socket.io connection established
2. Permission verification → Access granted
3. Previous messages loaded (last 50)
4. Real-time messaging with edit/delete capabilities
5. File sharing (images/videos) with live updates

### **4. Advanced Features**
- **Message History**: Persistent chat history
- **Connection Recovery**: Resume after brief disconnections
- **File Handling**: Automatic type detection and display
- **Responsive UI**: Optimized for all devices
- **Real-time Sync**: All users see updates instantly

## **Security Considerations**
- **Authentication**: JWT tokens in HTTP-only cookies prevent XSS
- **Authorization**: Room-based permissions for private spaces
- **File Validation**: Restrict uploads to images/videos only
- **Input Sanitization**: Prevent injection attacks
- **CORS Policy**: Controlled cross-origin access
- **Connection Security**: Socket.io permission checks

## **Performance Optimizations**
- **Message Pagination**: Load only recent messages (50 limit)
- **Static Caching**: Efficient file serving
- **Connection Recovery**: Minimize reconnection overhead
- **Selective Updates**: Only update changed messages
- **Lazy Loading**: Components load as needed

## **Testing and Debugging**
- **Console Logging**: Comprehensive request/error logging
- **MongoDB Monitoring**: Connection state tracking
- **Socket.io Events**: Real-time event debugging
- **Error Handling**: Graceful failure management
- **Development Tools**: Vite hot reload and debugging

This is a **complete, production-ready chat application** with modern web development practices, comprehensive security measures, real-time capabilities, and scalable architecture suitable for deployment in various environments.
