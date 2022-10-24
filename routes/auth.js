const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios')

let config = require('config'); //we load the db location from the JSON files

const log = require('../validation/log');
const Log = require('../models/Log')


// Authentication middleware
const auth = require('../validation/verifyToken')
const getCentralToken = require('./centralAuth')

// Validating the body of the request
const { registrationValidator, loginValidator } = require("../validation/validators.js")

const cors = require("cors");
const Project = require('../models/Project');
const Form = require('../models/Form');
const User = require('../models/User');

router.use(cors());
router.options("*", cors());


router.get("/", auth, async (req, res) => {
    
    const date = Date.now

    log({
        file: './routes/auth.js',
        line: '32',
        info: {
            message:'Getting user information',
            data:{
                'user_id':req.user._id
            }

        },
        type: 'message'
    }, Log)


    const userInfo = await User.findOne({ _id: req.user._id }, { _id: 0, roles: 1, projects: 1 })
    const projectInfo = await Project.find({ name: { $in: userInfo.projects } }, { _id: 0 })
    const formInfo = await Form.find({ project: { $in: userInfo.projects } }, { _id: 0 })

    let userInfoToReturn = userInfo.roles
    userInfoToReturn.projects = projectInfo
    userInfoToReturn.forms = formInfo

    res.status(200).send(userInfoToReturn)
    log({
        file: './routes/auth.js',
        line: '56',
        info: {
            message:'Successfully returned user information',
            data:{'user_id': userInfo._id}
        },
        type: 'message'
    },
        Log)
})


async function verifyCaptcha(props) {


    try {
        // await timeout(2000)
        log({
            file: './routes/auth.js',
            line: '73',
            info: {
                message:'Verifying Captcha',
                data:{
                    'props':props
                }
            },
            type: 'message'
        }, Log)

        const query_params = {
            "secret": process.env.RECAPTCHA_SECRET_KEY,
            "response": props.captchaToken
        }

        const response = await axios({
            method: "post",
            url: "https://www.google.com/recaptcha/api/siteverify",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            params: query_params
        })

        log({
            file: './routes/auth.js',
            line: '73',
            info: {
                message:'Captcha verified'
    
            },
            type: 'message'
        }, Log)

        return (response)
    } catch (err) {

        log({
            file: './routes/auth.js',
            line: '110',
            info: {
                message:'Could not successfully verify captcha',
                'err':err
    
            },
            type: 'message'
        }, Log)
        return (err)

    }
}


// Registration route
router.post('/register', async (req, res) => {

    // Validate date before making user
    const { error } = registrationValidator(req.body);
    if (error !== undefined) {
        log({
            file: './routes/auth.js',
            line: '134',
            info: {
                message:'Issue validating login request',
                'err':error
    
            },
            type: 'message'
        }, Log)
        
        return res.status(400).send(error.details[0].message)}

    // Checking if the user already exists in the database
    const emailExist = await User.findOne({ email: req.body.email })
    if (emailExist) {
        log({
            file: './routes/auth.js',
            line: '148',
            info: {
                message:'Cannot register email, user already exists',
                'err':error
    
            },
            type: 'message'
        }, Log)
        
        return res.status(400).send('Email already exists')}

    // Obtaining central access token
    try {

        // Verify User with Recaptcha
        const captchaResult = await verifyCaptcha({ captchaToken: req.body.captchaToken })


        log({
            file: './routes/auth.js',
            line: '168',
            info: {
                message:'Creating new user',
                'err':error
    
            },
            type: 'message'
        }, Log)

        // Save the user in the database
        // Hash passwords
        const salt = await bcrypt.genSalt(10)
        const hashPassword = await bcrypt.hash(req.body.password, salt)
        const date = new Date()
        // Create a new user
        const user = new User({
            title: req.body.title,
            firstName: req.body.firstName,
            surname: req.body.surname,
            email: req.body.email,
            password: hashPassword,
            roles: {
                basic: true,
                projectManager: [],
                dataCollector: [],
                analyst: [],
                researcher: false,
                administrator: false
            },
            projects: [],
            forms: [],
            log: [
                {
                    action: "user created",
                    byEmail: req.body.email,
                    date: date

                }
            ]
        });

        const savedUser = await user.save();

        log({
            file: './routes/auth.js',
            line: '214',
            info: {
                message:'New user successfully created',
                'err':error
    
            },
            type: 'message'
        }, Log)

        res.status(201).send({
            userID: savedUser._id
        })
    } catch (err) {
        res.status(400).send("error: " + err)
    }
})


// Login
router.post('/login', async (req, res) => {
    // Validate request
    const { error } = loginValidator(req.body)
    if (error !== undefined) return res.status(400).send(error.details[0].message)

    // Checking if the user is already existent
    const user = await User.findOne({ email: req.body.email })
    if (!user) return res.status(400).send('Email not found')

    // Check if password is correct
    const validPass = await bcrypt.compare(req.body.password, user.password);
    if (!validPass) return res.status(400).send('Incorrect password')

    var expiry = new Date()
    expiry.setHours(expiry.getHours() + 1)


    // Create and sign a token
    const token = jwt.sign({ _id: user._id, email: user.email, role: user.role, expiry: expiry }, process.env.TOKEN_SECRET)

    // Sending the JWT as a header but also as the 
    res.header({
        alg: "HS256",
        typ: "JWT"
    }).send(token)
})


router.post('/update', auth, async (req, res) => {
    res.send("reached the update endpoint")



})

router.post('/project-manager', auth, async (req, res) => {
    console.log("Finding the user")
    console.log(req.body)
    const otherUser = await User.findOne({ "email": req.body.email })
    console.log(otherUser)

    console.log("Checking if the user exists")
    if (!otherUser) {
        return res.status(400).send("User does not exist")
    }

    if (otherUser.roles.projectManager.includes(req.body.projectName)) {
        return res.status(400).send("User is already a project manager for this project")
    }
    console.log("Checking if the IDs are the same")

    if (otherUser._id.toString() === req.user._id) {
        return res.status(400).send("Please enter the email of another user")

    }


    console.log("Updating DB")
    try {
        console.log("Adding User to project")

        const updatedProject = await Project.updateOne(
            {
                name: req.body.projectName
            },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        console.log("Adding Users to forms")


        const updatedForms = await Form.updateMany({
            project: req.body.projectName
        },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })
        console.log("Adding forms to users")
        const formsToAdd = await Form.find({
            project: req.body.projectName
        })
        console.log(formsToAdd)
        const formIDs = formsToAdd.map((form) => form.name)
        console.log(formIDs)
        console.log("UserID")

        console.log(otherUser._id)
        const updatedUser = await User.updateOne(
            {
                _id: otherUser._id
            },
            {
                $addToSet: {
                    "roles.projectManager": req.body.projectName,
                    "roles.analyst": { $each: formIDs },
                    "roles.dataCollector": { $each: formIDs }
                }
            })
        console.log(updatedUser)

        return res.status(200).send(updatedUser)

    } catch (err) {
        return res.status(400).send(err)
    }

})

router.post('/data-collector', auth, async (req, res) => {

    console.log("Finding the user")

    const otherUser = await User.findOne({ "email": req.body.email })
    console.log("Checking if the user exists")
    if (!otherUser) {
        return res.status(400).send("User does not exist")
    }

    if (otherUser.roles.dataCollector.includes(req.body.formName)) {
        return res.status(400).send("User is already a data collector for this project")
    }
    console.log("Checking if the IDs are the same")

    if (otherUser._id.toString() === req.user._id) {
        return res.status(400).send("Please enter the email of another user")

    }


    console.log("Updating DB")
    try {

        const form = await Form.findOne(
            {
                "name": req.body.formName
            })

        console.log("Adding User to project")
        const updatedProject = await Project.updateOne(
            {
                name: form.project
            },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        console.log("Adding Users to forms")
        const updatedForms = await Form.updateOne({
            name: req.body.formName
        },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })
        console.log("Adding form to user")

        const updatedUser = await User.updateOne(
            {
                _id: otherUser._id
            },
            {
                $addToSet: {
                    "roles.dataCollector": req.body.formName
                }
            })
        console.log(updatedUser)

        return res.status(200).send(updatedUser)

    } catch (err) {
        return res.status(400).send(err)
    }

})

router.post('/analyst', auth, async (req, res) => {


    const otherUser = await User.findOne({ "email": req.body.email })
    console.log("Checking if the user exists")
    if (!otherUser) {
        return res.status(400).send("User does not exist")
    }

    if (otherUser.roles.analyst.includes(req.body.formName)) {
        return res.status(400).send("User is already an analyst for this project")
    }
    console.log("Checking if the IDs are the same")

    if (otherUser._id.toString() === req.user._id) {
        return res.status(400).send("Please enter the email of another user")

    }


    console.log("Updating DB")
    try {

        const form = await Form.findOne(
            {
                "name": req.body.formName
            })

        console.log("Adding User to project")
        const updatedProject = await Project.updateOne(
            {
                name: form.project
            },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        console.log("Adding Users to forms")
        const updatedForms = await Form.updateOne({
            name: req.body.formName
        },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })
        console.log("Adding form to user")

        const updatedUser = await User.updateOne(
            {
                _id: otherUser._id
            },
            {
                $addToSet: {
                    "roles.analyst": req.body.formName
                }
            })
        console.log(updatedUser)

        return res.status(200).send(updatedUser)

    } catch (err) {
        return res.status(400).send(err)
    }


})


// Delete user
router.delete('/delete', auth, async (req, res) => {
    const userToDelete = await User.findOne({ _id: req.user._id })

    if (!userToDelete) return res.status.apply(400).send('User does not exist in local db, cannot delete')

    try {

        const deletedUser = await User.findOneAndDelete({ _id: req.user._id })
        res.status(200).send(deletedUser)

    } catch (err) {
        res.status(400).send(err)
    }


})

module.exports = router;
