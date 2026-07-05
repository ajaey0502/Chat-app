import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import io from 'socket.io-client'
import MessageList from './MessageList'
import MessageForm from './MessageForm'
import { useToast } from './Toast'
import './Chat.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const Chat = ({ username, room, onLogout }) => {
  const [messages, setMessages] = useState([])
  const [socket, setSocket] = useState(null)
  const [roomInfo, setRoomInfo] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState('')
  const [isConnecting, setIsConnecting] = useState(true)
  const [latencyStats, setLatencyStats] = useState({ last: null, avg: null, measurements: [] })
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [seenCutoff, setSeenCutoff] = useState(null)
  const messagesEndRef = useRef(null)
  const messagesListRef = useRef(null)
  const skipAutoScrollRef = useRef(false)
  const prevScrollHeightRef = useRef(0)
  const navigate = useNavigate()
  const { showToast } = useToast()

  // missing props
  useEffect(() => {
    if (!username || !room) {
      console.log('Missing username or room, redirecting to dashboard')
      navigate('/dashboard')
      return
    }

    // Fetch room information for display
    fetchRoomInfo()
  }, [username, room, navigate])

  const fetchRoomInfo = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/room-info?room=${room}`, {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setRoomInfo(data.room)
          setIsOwner(data.room.owner === username)
        }
      }
    } catch (error) {
      console.error('Error fetching room info:', error)
    }
  }



  useEffect(() => {
    // Don't connect if missing username or room
    if (!username || !room) {
      return
    }

    // Connect to socket with explicit server URL
    const serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000'
    const newSocket = io(serverUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    })
    setSocket(newSocket)

    // Join room
    newSocket.emit('join room', { username, room })

    // Handle join success
    newSocket.on('join success', (data) => {
      console.log('Successfully joined room:', data.message)
      setIsConnecting(false)
    })

    // Handle join errors
    newSocket.on('join error', (error) => {
      console.error('Join room error:', error.message)
      setError(error.message)
      setIsConnecting(false)
      setTimeout(() => navigate('/dashboard'), 2000)
    })

    // Listen for user joined notifications
    newSocket.on('user joined', (data) => {
      console.log(data.message)
    })

    // Initial snapshot of who's online in this room, sent right after joining
    newSocket.on('presence list', (data) => {
      setOnlineUsers(new Set(data.onlineUsers))
    })

    // Live online/offline updates as members connect/disconnect
    newSocket.on('presence update', (data) => {
      setOnlineUsers(prev => {
        const next = new Set(prev)
        if (data.online) {
          next.add(data.username)
        } else {
          next.delete(data.username)
        }
        return next
      })
    })

    // "Seen by all" cutoff - messages at or before this time have been read
    // by every member of the room
    newSocket.on('seen update', (data) => {
      setSeenCutoff(new Date(data.cutoff).getTime())
    })

    // Listen for previous messages (most recent page)
    newSocket.on('prev', (data) => {
      setMessages(data.messages)
      setHasMoreMessages(data.hasMore)
    })

    // Listen for an older page of history requested via loadOlderMessages
    newSocket.on('older messages', (data) => {
      const container = messagesListRef.current
      prevScrollHeightRef.current = container ? container.scrollHeight : 0
      skipAutoScrollRef.current = true
      setMessages(prev => [...data.messages, ...prev])
      setHasMoreMessages(data.hasMore)
      setIsLoadingOlder(false)
    })

    // Listen for new messages with latency measurement
    newSocket.on('chat message', (data) => {
      setMessages(prev => [...prev, data])

      // ⚡ Calculate round-trip latency if this is our own message
      if (data.clientSendTime) {
        const roundTripTime = Date.now() - data.clientSendTime
        console.log(`⚡ LATENCY MEASUREMENT:`)
        console.log(`   📤 Round-trip time: ${roundTripTime}ms`)
        console.log(`   🖥️  Server processing: ${data.serverProcessingTime}ms`)
        console.log(`   🌐 Network time: ${roundTripTime - data.serverProcessingTime}ms`)

        // Update latency stats
        setLatencyStats(prev => {
          const newMeasurements = [...prev.measurements, roundTripTime].slice(-10) // Keep last 10
          const avg = Math.round(newMeasurements.reduce((a, b) => a + b, 0) / newMeasurements.length)
          return { last: roundTripTime, avg, measurements: newMeasurements }
        })
      }
    })

    // EDIT: Replace message in same position
    newSocket.on('message edited', (updatedMessage) => {
      setMessages(prev => prev.map(msg =>
        msg._id === updatedMessage._id ? updatedMessage : msg
      ))
    })

    // DELETE: Remove message from array
    newSocket.on('message deleted', (messageId) => {
      setMessages(prev => prev.filter(msg => msg._id !== messageId))
    })

    // Cleanup on unmount - remove all listeners
    return () => {
      newSocket.off('join success')
      newSocket.off('join error')
      newSocket.off('user joined')
      newSocket.off('presence list')
      newSocket.off('presence update')
      newSocket.off('seen update')
      newSocket.off('prev')
      newSocket.off('older messages')
      newSocket.off('chat message')
      newSocket.off('message edited')
      newSocket.off('message deleted')
      newSocket.close()
    }
  }, [username, room, navigate])

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      // Just prepended older history - keep the user's viewport anchored
      // to the same message instead of jumping to the bottom or top
      const container = messagesListRef.current
      if (container) {
        container.scrollTop = container.scrollHeight - prevScrollHeightRef.current
      }
      skipAutoScrollRef.current = false
    } else {
      // Auto-scroll to bottom for new/live messages
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const loadOlderMessages = () => {
    if (!socket || !hasMoreMessages || isLoadingOlder || messages.length === 0) return
    setIsLoadingOlder(true)
    socket.emit('load older messages', { room, before: messages[0]._id })
  }


  // Reusable API call function
  const apiCall = async (endpoint, data) => {
    return fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    })
  }

  const sendMessage = (message) => {
    if (!socket || !socket.connected) {
      console.error('Socket not connected')
      setError('Connection lost. Please refresh the page.')
      return
    }

    if (message.trim()) {
      socket.emit('chat message', {
        username,
        room,
        message: message.trim(),
        clientSendTime: Date.now() // ⚡ Timestamp for latency measurement
      })
    }
  }

  const editMessage = async (messageId, newText) => {
    try {
      const response = await apiCall('/chat/editMessage', { messageId, newText, room })
      if (!response.ok) {
        console.error('Failed to edit message')
      }
    } catch (error) {
      console.error('Error editing message:', error)
    }
  }

  const deleteMessage = async (messageId) => {
    try {
      const response = await apiCall('/chat/deleteMessage', { messageId, room })
      if (!response.ok) {
        console.error('Failed to delete message')
      }
    } catch (error) {
      console.error('Error deleting message:', error)
    }
  }

  const handleLeaveRoom = async () => {
    try {
      const response = await apiCall('/chat/leaveRoom', { username, room })

      if (response.ok) {
        // Redirect to dashboard
        navigate('/dashboard')
      }
    } catch (error) {
      console.error('Error leaving room:', error)
    }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    const newMembers = e.target.newMembers.value

    try {
      const response = await apiCall('/chat/add-member', { room, newMembers })

      if (response.ok) {
        e.target.reset()
        showToast('Members added successfully!', 'success')
      }
    } catch (error) {
      console.error('Error adding members:', error)
      showToast('Failed to add members. Please try again.', 'error')
    }
  }

  const handleRemoveMember = async (targetUser) => {
    if (!window.confirm(`Remove ${targetUser} from this room?`)) return

    try {
      const response = await apiCall('/chat/remove-member', { room, targetUser })
      const data = await response.json()

      if (response.ok) {
        showToast(`${targetUser} removed from room`, 'success')
        fetchRoomInfo()
      } else {
        showToast(data.error || 'Failed to remove member', 'error')
      }
    } catch (error) {
      console.error('Error removing member:', error)
      showToast('Failed to remove member', 'error')
    }
  }

  const handleFileUpload = async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('room', room)

      const response = await fetch(`${API_URL}/chat/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      console.log('File uploaded successfully:', data)

      // Emit file upload message through socket
      if (socket && data.fileUrl) {
        socket.emit('chat message', {
          username,
          room,
          message: `📎 ${file.name}`,
          fileUrl: data.fileUrl,
          fileType: file.type
        })
      }
    } catch (error) {
      console.error('File upload error:', error)
      throw error
    }
  }

  return (
    <div id="chat-container">
      {isConnecting && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <h3>Connecting to room...</h3>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #1976d2',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          </div>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
      <div className="chat-header">
        {error && <div className="error-message">{error}</div>}
        <div className="header-main">
          <div className="header-info">
            <h2>Room: {room} {isOwner && <span className="owner-badge">(Owner)</span>}</h2>
            <h4>Current User: {username}</h4>
            {roomInfo && (
              <p className="room-details">
                {roomInfo.isPrivate ? '🔒 Private' : '🌐 Public'} •{' '}
                <button
                  type="button"
                  className="member-toggle"
                  onClick={() => setShowMembers(s => !s)}
                >
                  👥 {roomInfo.members.length} member{roomInfo.members.length !== 1 ? 's' : ''}
                </button>
              </p>
            )}

            {showMembers && roomInfo && (
              <div className="members-panel">
                {roomInfo.members.map(member => (
                  <div key={member} className="member-row">
                    <span>
                      <span
                        className={`presence-dot ${onlineUsers.has(member) ? 'online' : 'offline'}`}
                        title={onlineUsers.has(member) ? 'Online' : 'Offline'}
                      />
                      {member}
                      {member === roomInfo.owner && <span className="owner-badge-inline">Owner</span>}
                    </span>
                    {isOwner && roomInfo.isPrivate && member !== username && (
                      <button
                        type="button"
                        className="remove-member-btn"
                        onClick={() => handleRemoveMember(member)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* ⚡ Latency Stats Display */}
            {latencyStats.last !== null && (
              <div style={{
                marginTop: '8px',
                padding: '6px 12px',
                backgroundColor: latencyStats.last < 100 ? '#4caf50' : latencyStats.last < 200 ? '#ff9800' : '#f44336',
                color: 'white',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                display: 'inline-block'
              }}>
                ⚡ Latency: {latencyStats.last}ms (avg: {latencyStats.avg}ms)
                {latencyStats.last < 100 && ' ✓ Under 100ms!'}
              </div>
            )}
          </div>
          <div className="header-actions">
            <button onClick={handleLeaveRoom} className="leave-btn">
              Leave Group
            </button>
          </div>
        </div>

        {isOwner && (
          <form onSubmit={handleAddMember} className="add-member-form">
            <input
              name="newMembers"
              placeholder="Usernames to add (comma-separated)"
              required
            />
            <button type="submit">Add Member</button>
          </form>
        )}
      </div>

      {hasMoreMessages && (
        <button
          onClick={loadOlderMessages}
          disabled={isLoadingOlder}
          className="load-more-btn"
        >
          {isLoadingOlder ? 'Loading...' : 'Load older messages'}
        </button>
      )}

      <MessageList
        messages={messages}
        currentUsername={username}
        onEdit={editMessage}
        onDelete={deleteMessage}
        listRef={messagesListRef}
        seenCutoff={seenCutoff}
      />

      <div ref={messagesEndRef} />

      <MessageForm onSendMessage={sendMessage} onFileUpload={handleFileUpload} />
    </div>
  )
}

export default Chat
