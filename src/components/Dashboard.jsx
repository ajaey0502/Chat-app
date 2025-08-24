import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Dashboard.css'

const Dashboard = ({ setCurrentRoom, username ,logout}) => {
  const [rooms, setRooms] = useState([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Fetch all rooms on component mount
  useEffect(() => {
    fetchRooms()
  }, [username])

  const fetchRooms = async () => {
    try {
      setLoading(true)
      console.log('Fetching rooms...')
      const response = await fetch('/chat/rooms', {
        credentials: 'include' // Include cookies for JWT
      })
      console.log('Response status:', response.status)
      const data = await response.json()
      console.log('Response data:', data)
      
      if (data.success) {
        setRooms(data.rooms)
        setError('')
      } else {
        setError(data.error || 'Failed to fetch rooms')
      }
    } catch (error) {
      console.error('Fetch rooms error:', error)
      setError('Failed to fetch rooms')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = async (room) => {
    setError('')
    
    try {
      // Check if room exists and user can join
      const response = await fetch(`/chat?room=${room.name}`, {
        credentials: 'include' // Include cookies for JWT
      })
      const data = await response.json()
      
      if (data.success) {
        setCurrentRoom(room.name)
        navigate('/chat')
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError('Failed to join room')
    }
  }

  const handleCreateRoom = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!roomName.trim()) return
    
    try {
      const response = await fetch('/chat/createRoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for JWT
        body: JSON.stringify({
          roomName: roomName.trim(),
          isPrivate
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Refresh the rooms list
        await fetchRooms()
        // Reset form
        setShowCreateForm(false)
        setRoomName('')
        setIsPrivate(false)
        // Join the newly created room
        setCurrentRoom(roomName.trim())
        navigate('/chat')
      } else {
        setError(data.error)
      }
    } catch (error) {
      setError('Failed to create room')
    }
  }

  const handleCancelCreate = () => {
    setShowCreateForm(false)
    setRoomName('')
    setIsPrivate(false)
    setError('')
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading rooms...</div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      <h2>Welcome, {username}!</h2>
      
      {error && <div className="error-message">{error}</div>}
      
         <div className = "logout-btn">
         <button onClick = {logout}> Logout </button>
        </div>
        
      <div className="rooms-section">
        <div className="rooms-header">
          <h3>Available Rooms</h3>
          <button 
            className="add-room-btn"
            onClick={() => setShowCreateForm(true)}
            title="Create new room"
          >
            +
          </button>
        </div>

     

        {showCreateForm && (
          <div className="create-room-form">
            <h4>Create New Room</h4>
            <form onSubmit={handleCreateRoom}>
              <input
                type="text"
                placeholder="Enter room name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                required
                autoFocus
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                Private Room (only invited members can join)
              </label>
              <div className="form-actions">
                <button type="submit">Create Room</button>
                <button type="button" onClick={handleCancelCreate}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="rooms-grid">
          {rooms.length === 0 ? (
            <div className="no-rooms">
              <p>No rooms available. Create your first room!</p>
            </div>
          ) : (
            rooms.map((room) => (
              <div 
                key={room._id} 
                className={`room-card ${room.isPrivate ? 'private' : 'public'}`}
                onClick={() => handleJoinRoom(room)}
              >
                <div className="room-info">
                  <h4>{room.name}</h4>
                  <div className="room-details">
                    <span className={`room-type ${room.isPrivate ? 'private' : 'public'}`}>
                      {room.isPrivate ? '🔒 Private' : '🌐 Public'}
                    </span>
                    <span className="member-count">
                      👥 {room.members.length} member{room.members.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {room.owner === username && (
                    <span className="owner-badge">Owner</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
