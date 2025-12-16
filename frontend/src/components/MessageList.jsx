import Message from './Message'

const MessageList = ({ messages, currentUsername, onEdit, onDelete }) => {
  return (
    <ul id="messages" className="messages-list">
      {messages.map((message) => (
        <Message
          key={message._id}
          message={message}
          isOwn={message.username === currentUsername}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

export default MessageList
