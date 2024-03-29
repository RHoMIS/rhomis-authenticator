
const router = require('express').Router();
const axios = require('axios')
let config = require('config'); //we load the db location from the JSON files
const bcrypt = require('bcryptjs');
const auth = require('../validation/verifyToken')
const cors = require("cors");

const { registrationValidator, loginValidator } = require("../validation/validators.js")

const Project = require('../models/Project');
const Form = require('../models/Form');
const User = require('../models/User');

const log = require('../validation/log');
const Log = require('../models/Log')


router.use(cors());
router.options("*", cors());

async function initAdmin() {
    log({
        file: './routes/makeAdmin.js',
        line: '25',
        info: {
            message:'Initializing admin',
            
            
        },
        type: 'message'
    }, Log)
    const salt = await bcrypt.genSalt(10)
    const hashPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt)
    const date = new Date()


    const projectIDs = await Project.distinct("name")
    const formIDs = await Form.distinct("name")


    const logValue =
    {
        "action": "User initialised on server startup",
        "byEmail": process.env.ADMIN_EMAIL,
        "date": date
    }

    // Add all projects to user
    const updatedUser = await User.updateOne({
        email: process.env.ADMIN_EMAIL
    },
        {
            "$set": {
                email: process.env.ADMIN_EMAIL,
                password: hashPassword,
                roles: {
                    basic: true,
                    projectManager: projectIDs,
                    dataCollector: formIDs,
                    analyst: formIDs,
                    researcher: true,
                    administrator: true
                },
                projects: projectIDs,
                forms: formIDs
            },
        },


        {
            upsert: true
        }

    )


    const userWithLog = await User.updateOne({
        email: process.env.ADMIN_EMAIL
    },
        {
            "$addToSet": {
                log: logValue
            }
        })


    const newUser = await User.findOne({ "email": process.env.ADMIN_EMAIL })

    // Add user to all projects
    const updatedForms = await Form.updateMany({}, {
        $addToSet: {
            users: newUser._id.toString()
        }
    })

    const updatedProjects = await Project.updateMany({}, {
        $addToSet: {
            users: newUser._id.toString()
        }
    })


    updateAdmins()

}

async function updateAdmins() {

    log({
        file: './routes/makeAdmin.js',
        line: '110',
        info: {
            message:'Updating all admins'
            
            
        },
        type: 'message'
    }, Log)

    // Add all projects and forms to admins
    const date = new Date()

    const projectIDs = await Project.distinct("name")
    const formIDs = await Form.distinct("name")

    const updatedUser = await User.updateMany({
        "roles.administrator": true
    }, {
        $set: {
            projects: projectIDs,
            forms: formIDs,
            "roles.projectManager": projectIDs,
            "roles.dataCollector": formIDs,
            "roles.analyst": formIDs,
        },

        $push: {
            log: {
                "action": "Admin updated",
                "byEmail": process.env.ADMIN_EMAIL,
                "date": date
            }
        }

    },
        {
            upsert: true
        })



    // Add admins to all projects
    let userIDs = await User.find({ "roles.administrator": true }).distinct("_id")
    userIDs = userIDs.map((id) => id.toString())


    // Add user to all projects
    const updatedForms = await Form.updateMany({}, {
        $addToSet: {
            users: { "$each": userIDs }
        }
    })

    const updatedProjects = await Project.updateMany({}, {
        $addToSet: {
            users: { "$each": userIDs }
        }
    })







    // Add admins to all forms
}

router.post('/', auth, async (req, res) => {

    const user = await User.findOne({ "_id": req.user._id })
    const newUser = await User.find({ "email": req.body.email })
    log({
        file: './routes/makeAdmin.js',
        line: '1186',
        info: {
            message:'Adding new admin'
            
            
        },
        type: 'message'
    }, Log)

    if (!newUser || newUser.length === 0) {
        return res.status(400).send("Could not find the user you wanted to add")
    }


    console.log(user)

    if (user.roles.administrator === true) {

        try {
            const updatedUser = await User.updateOne({ "email": req.body.email }, { "roles.administrator": true })
            await updateAdmins()
            return res.status(200).send("Success")
        } catch (err) {
            log({
                file: './routes/makeAdmin.js',
                line: '209',
                info: {
                    message:'Failed to add new admin',
                    error: err
                    
                    
                },
                type: 'message'
            }, Log)
            res.status(400).send(err)
        }
    }

    return res.status(400).send("Unauthorised")

})

module.exports.router = router
module.exports.initAdmin = initAdmin
module.exports.updateAdmins = updateAdmins