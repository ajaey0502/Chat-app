const mongoose = require("mongoose")

const roomSchema = new mongoose.Schema({
    name : {
        type : String,
        required : true,
        unique : true,
    },
    isPrivate: {
        type: Boolean,
        default: false
    },
    owner: {
        type: String,
        required: true
    },
    members : [String]
   }, {timestamps: true}
     )

const room = mongoose.model("room",roomSchema)

module.exports = room