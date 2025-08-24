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
  }, [username, room])

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

    // Connect to socket
    const newSocket = io()
    setSocket(newSocket)

    // Join room
    newSocket.emit('join room', { username, room })

    // Handle join errors
    newSocket.on('join error', (error) => {
      console.error('Join room error:', error.message)
      alert(error.message)
      navigate('/dashboard')
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

    // ✅ DELETE: Remove message from array
  newSocket.on('message deleted', (messageId) => {
    setMessages(prev => prev.filter(msg => msg._id !== messageId))
  })

    // Cleanup on unmount
    return () => {
      newSocket.close()
    }
  }, [username, room])

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
    if (socket && message.trim()) {
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
    } catch (error) {
      console.error('File upload error:', error)
      throw error
    }
  }

  return (
    <div id="chat-container">
      <div className="chat-header">
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
          <button onClick={handleLeaveRoom} className="leave-btn">
            Leave Group
          </button>
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
