import React, { useState } from 'react'

const Message = ({ message, isOwn, onEdit, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.message)

  const hasFile = message.fileUrl && message.fileType
  const isImage = message.fileType === 'image'
  const isVideo = message.fileType === 'video'
  const isPdf = message.fileType === 'pdf'

  // Check if message is within 15 minutes (900000 milliseconds)
  const isWithin15Minutes = () => {
    const messageTime = new Date(message.createdAt).getTime()
    const currentTime = Date.now()
    const timeDiff = currentTime - messageTime
    return timeDiff <= 15 * 60 * 1000 // 15 minutes in milliseconds
  }

  const canModify = isWithin15Minutes()

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== message.message) {
      onEdit(message._id, editText.trim())
    }
    setIsEditing(false)
  }

  const handleCancelEdit = () => {
    setEditText(message.message)
    setIsEditing(false)
  }

  const handleDelete = () => {
    onDelete(message._id)
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSaveEdit()
    } else if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  return (
    <li className={`message ${isOwn ? 'own-message' : ''}`} data-id={message._id}>
      {isEditing ? (
        <div className="edit-container">
          <span className="username">{message.username}: </span>
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyPress}
            className="edit-input"
            autoFocus
          />
          <button onClick={handleSaveEdit} className="save-btn">Save</button>
          <button onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
        </div>
      ) : (
        <>
          <span className="message-content">
            <span className="username">{message.username}: </span>
            {hasFile ? (
              <div className="file-message">
                <span className="message-text">{message.message}</span>
                {isImage && (
                  <div className="image-container">
                    <img 
                      src={message.fileUrl} 
                      alt={message.fileName}
                      className="message-image"
                      onClick={() => window.open(message.fileUrl, '_blank')}
                    />
                  </div>
                )}
                {isVideo && (
                  <div className="video-container">
                    <video 
                      src={message.fileUrl}
                      controls
                      className="message-video"
                      preload="metadata"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                )}
                {isPdf && (
                  <div className="pdf-container">
                    <a 
                      href={message.fileUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="pdf-link"
                    >
                      📄 {message.fileName || 'View PDF'}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <span className="message-text">{message.message}</span>
            )}
          </span>
          {isOwn && canModify && !hasFile && (
            <div className="message-actions">
              <button onClick={handleEdit} className="edit-btn">Edit</button>
              <button onClick={handleDelete} className="delete-btn">Delete</button>
            </div>
          )}
          {isOwn && canModify && hasFile && (
            <div className="message-actions">
              <button onClick={handleDelete} className="delete-btn">Delete</button>
            </div>
          )}
        </>
      )}
    </li>
  )
}

export default Message
