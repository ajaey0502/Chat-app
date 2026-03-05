require('dotenv').config()
const mongoose = require('mongoose')
const Room = require('../models/room')

    ; (async () => {
        await mongoose.connect(process.env.MONGODB_URI)
        const rooms = await Room.find({ name: { $in: ['latency-test', 'aj1'] } }).lean()
        for (const r of rooms) {
            console.log(`\nRoom: ${r.name}  |  members: ${JSON.stringify(r.members)}`)
        }
        await mongoose.disconnect()
        process.exit(0)
    })()
