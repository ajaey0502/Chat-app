// Purge all users (and optionally related data) to ensure only strong-password accounts remain.
// Run with: node scripts/purgeUsers.js
// WARNING: This deletes ALL users. Uncomment related deletions if you want to wipe rooms/messages too.

const mongoose = require('mongoose')
const User = require('../models/user')
const Room = require('../models/room')
const Message = require('../models/message')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp'

async function run() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    const userResult = await User.deleteMany({})
    console.log(`Deleted users: ${userResult.deletedCount}`)

    // If you also want to wipe rooms/messages, uncomment below:
    // const roomResult = await Room.deleteMany({})
    // console.log(`Deleted rooms: ${roomResult.deletedCount}`)
    // const msgResult = await Message.deleteMany({})
    // console.log(`Deleted messages: ${msgResult.deletedCount}`)

    await mongoose.disconnect()
    console.log('Done. Recreate users with strong passwords only.')
  } catch (err) {
    console.error('Purge failed:', err)
    process.exit(1)
  }
}

run()
