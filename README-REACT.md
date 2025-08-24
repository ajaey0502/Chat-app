# Chat App - React Version

This is the React version of your chat application, maintaining all the same features as the original EJS version.

## Features Maintained

- ✅ Real-time messaging with Socket.io
- ✅ Room-based chat
- ✅ Edit and delete messages (for message owners)
- ✅ Add members to room
- ✅ Leave room functionality
- ✅ Message history on join
- ✅ Auto-scroll to latest messages

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Development Mode

Run both the backend server and React dev server:

```bash
# Option 1: Run both in one command
npm run dev:full

# Option 2: Run in separate terminals
# Terminal 1 - Start the Express server
npm start

# Terminal 2 - Start React development server  
npm run dev
```

The React app will be available at `http://localhost:3000` and will proxy API calls to your Express server at `http://localhost:8000`.

### 3. Production Build

```bash
# Build React app for production
npm run build

# Start only the Express server (serves React app)
NODE_ENV=production npm start
```

## File Structure

```
src/
├── components/
│   ├── Chat.jsx          # Main chat interface (replaces chat.ejs)
│   ├── Chat.css          # Chat styles (matches original EJS styles)
│   ├── Message.jsx       # Individual message component
│   ├── MessageList.jsx   # List of messages
│   ├── MessageForm.jsx   # Message input form
│   ├── Login.jsx         # Login page (placeholder)
│   ├── Signup.jsx        # Signup page (placeholder)
│   └── Dashboard.jsx     # Dashboard for joining rooms
├── App.jsx               # Main React app with routing
├── main.jsx              # React entry point
└── index.css             # Global styles
```

## Key Changes from EJS Version

### What's the Same:
- All server-side logic (Express routes, Socket.io, database)
- API endpoints (now return JSON instead of HTML)
- Socket.io events and room logic
- Database models and schemas

### What's Different:
- Frontend is now React components instead of EJS templates
- Client-side routing with React Router
- State management with React hooks
- Better edit/delete UX (inline editing instead of prompt)
- Component-based architecture for better maintainability
- All API endpoints now return JSON responses
- Authentication works with form submission and JSON responses

### Files Removed:
- ❌ All EJS template files (.ejs)
- ❌ EJS dependency from package.json
- ❌ EJS configuration from server
- ❌ Server-side HTML rendering

## Usage

1. Navigate to `http://localhost:3000`
2. Go to Dashboard to enter username and room
3. Chat with real-time messaging
4. Edit/delete your own messages
5. Add members to rooms
6. Leave rooms when done

## Environment Variables

- `NODE_ENV=production` - Serves React build instead of redirecting to dev server

## Notes

- The original `public/chat.js` file is no longer needed
- EJS views are no longer used for the React routes
- Socket.io connection works the same way
- All existing API endpoints remain unchanged
