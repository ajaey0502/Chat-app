import React, { useState, useRef } from 'react'

const MessageForm = ({ onSendMessage, onFileUpload }) => {
  const [message, setMessage] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (message.trim()) {
      onSendMessage(message)
      setMessage('')
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        alert('File size exceeds 10MB limit')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }

      setIsUploading(true)
      try {
        await onFileUpload(file)
        // Success feedback
        console.log('File uploaded successfully')
      } catch (error) {
        console.error('File upload failed:', error)
        alert('File upload failed. Please try again.')
      } finally {
        setIsUploading(false)
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
    }
  }

  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="message-form-container">
      <form id="form" onSubmit={handleSubmit} autoComplete="off">
        <input
          id="input"
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          autoComplete="off"
          disabled={isUploading}
        />
        <button 
          type="button" 
          className="file-upload-btn" 
          onClick={triggerFileInput}
          disabled={isUploading}
          title="Upload image or video"
        >
          📎
        </button>
        <button 
          id="send" 
          type="submit" 
          title="Send message"
          disabled={isUploading}
        >
          {isUploading ? '⏳' : '➤'}
        </button>
      </form>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default MessageForm
