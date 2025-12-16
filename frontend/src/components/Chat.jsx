import  { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import io from 'socket.io-client'
import MessageList from './MessageList'
import MessageForm from './MessageForm'
import './Chat.css'

const Chat = ({ username, room, onLogout }) => {
  const [messages, setMessages] = useState([])
  const [socket, setSocket] = useState(null)
  const [roomInfo, setRoomInfo] = useState(null)
  const [isOwner, setIsOwner] = useState(false)
  const [error, setError] = useState('')
  const [isConnecting, setIsConnecting] = useState(true)
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

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
      const response = await fetch(`/chat/room-info?room=${room}`, {
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

    // Listen for previous messages
    newSocket.on('prev', (prevData) => {
      setMessages(prevData)
    })

    // Listen for new messages
    newSocket.on('chat message', (data) => {
      setMessages(prev => [...prev, data])
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
      newSocket.off('prev')
      newSocket.off('chat message')
      newSocket.off('message edited')
      newSocket.off('message deleted')
      newSocket.close()
    }
  }, [username, room, navigate])

  useEffect(() => {
    // Auto-scroll to bottom
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])


    // Reusable API call function
  const apiCall = async (endpoint, data) => {
    return fetch(endpoint, {
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
        message: message.trim()
      })
    }
  }

  const editMessage = async (messageId, newText) => {
    try {
      const response = await apiCall('/chat/editMessage', { messageId, newText,room })
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
      const response = await apiCall('/chat/add-member', { room,newMembers })
      
      if (response.ok) {
        e.target.reset()
        alert('Members added successfully!')
      }
    } catch (error) {
      console.error('Error adding members:', error)
    }
  }

  const handleFileUpload = async (file) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('room', room)

      const response = await fetch('/chat/upload', {
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
                {roomInfo.isPrivate ? '🔒 Private' : '🌐 Public'} • 
                👥 {roomInfo.members.length} member{roomInfo.members.length !== 1 ? 's' : ''}
              </p>
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

      <MessageList 
        messages={messages} 
        currentUsername={username}
        onEdit={editMessage}
        onDelete={deleteMessage}
      />
      
      <div ref={messagesEndRef} />
      
      <MessageForm onSendMessage={sendMessage} onFileUpload={handleFileUpload} />
    </div>
  )
}

export default Chat
