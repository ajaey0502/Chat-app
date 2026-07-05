const mongoose = require("mongoose")

const readReceiptSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    room: {
        type: String,
        required: true
    },
    lastReadAt: {
        type: Date,
        default: Date.now
    }
})

readReceiptSchema.index({ username: 1, room: 1 }, { unique: true })

module.exports = mongoose.model("ReadReceipt", readReceiptSchema)
