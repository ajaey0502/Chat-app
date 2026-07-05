import Message from './Message'

const MessageList = ({ messages, currentUsername, onEdit, onDelete, listRef, seenCutoff }) => {
  return (
    <ul id="messages" className="messages-list" ref={listRef}>
      {messages.map((message) => {
        const isOwn = message.username === currentUsername
        return (
          <Message
            key={message._id}
            message={message}
            isOwn={isOwn}
            onEdit={onEdit}
            onDelete={onDelete}
            seenByAll={isOwn && seenCutoff !== null && new Date(message.createdAt).getTime() <= seenCutoff}
          />
        )
      })}
    </ul>
  )
}

export default MessageList
