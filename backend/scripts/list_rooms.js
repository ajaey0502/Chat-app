require('dotenv').config()
const mongoose = require('mongoose')
const Room = require('../models/room')
const Message = require('../models/message')

    ; (async () => {
        await mongoose.connect(process.env.MONGODB_URI)
        const rooms = await Room.find().lean()
        console.log('\n📋 Rooms in DB:')
        for (const r of rooms) {
            const count = await Message.countDocuments({ room: r.name })
            console.log(`  name="${r.name}"  messages=${count}`)
        }
        await mongoose.disconnect()
        process.exit(0)
    })()
