const mongoose = require('mongoose');




const collectionDetailsSchema = new mongoose.Schema({
    general: {
        type: Object
    },
    project: {
        type: Object
    },
    admin: {
        type: Object,
        default: {}
    }

}, {
    minimize: false,
    _id: false,
    strict: false
})

const formSchema = new mongoose.Schema({
    name: {
        type: String,
    },
    project: {
        type: String,
    },
    users: {
        type: Object,
    },
    metadata: {
        type: Object,
    },
    centralID: {
        type: String,
    },
    formVersion: {
        type: String,
    },
    draftVersion: {
        type: String,
        default: null
    },
    liveVersion: {
        type: String,
        default: null

    },
    draft: {
        type: Boolean,
    },
    complete: {
        type: Boolean,
    },
    live: {
        type: Boolean,
    }, 
    createdAt: {
        type: Date,
        default: Date.now
    },
    collectionDetails: {
        type: collectionDetailsSchema,
    },
    draftCollectionDetails: {
        type: collectionDetailsSchema,
    }

}, { minimize: false })

module.exports = mongoose.model('Form', formSchema)