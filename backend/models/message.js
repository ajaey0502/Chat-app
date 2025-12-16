const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema({
    username : {
        type : String,
        required : true
    },
    message : {
        type : String,
        required : true
    },
    room : {
          type : String,
        required : true
    },
   createdAt : {
          type: Date, 
          default: Date.now 
    },
    edited : {
        type : Boolean,
        default : false
    },
    fileUrl: {
        type: String,
        default: null
    },
    fileType: {
        type: String,
        enum: ['image', 'video', 'pdf', null],
        default: null
    },
    fileName: {
        type: String,
        default: null
    }
})

const messageModel = mongoose.model("message" , messageSchema)
module.exports = messageModel