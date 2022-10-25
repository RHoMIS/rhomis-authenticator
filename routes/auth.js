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
    log({
        file: './routes/auth.js',
        line: '238',
        info: {
            message:'Attempting to login',

        },
        type: 'message'
    }, Log)

    const { error } = loginValidator(req.body)
    if (error !== undefined) return res.status(400).send(error.details[0].message)

    // Checking if the user is already existent
    const user = await User.findOne({ email: req.body.email })
    if (!user) {
        log({
            file: './routes/auth.js',
            line: '252',
            info: {
                message:'Email not found',
    
            },
            type: 'message'
        }, Log)
        return res.status(400).send('Email not found')
    
    }

    // Check if password is correct
    const validPass = await bcrypt.compare(req.body.password, user.password);
    if (!validPass) {
        log({
            file: './routes/auth.js',
            line: '252',
            info: {
                message:'Incorrect password',
    
            },
            type: 'message'
        }, Log)
        return res.status(400).send('Incorrect password')
    }

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
    log({
        file: './routes/auth.js',
        line: '252',
        info: {
            message:'Adding project manager',
            data:{
                user_id: req.user._id
            }
        },
        type: 'message'
    }, Log)
    const otherUser = await User.findOne({ "email": req.body.email })

    if (!otherUser) {
        log({
            file: './routes/auth.js',
            line: '317',
            info: {
                message:'User trying to add does not exist',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send("User does not exist")
    }

    if (otherUser.roles.projectManager.includes(req.body.projectName)) {
        log({
            file: './routes/auth.js',
            line: '332',
            info: {
                message:'User they are adding is already a project manager',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send("User is already a project manager for this project")
    }

    if (otherUser._id.toString() === req.user._id) {

        return res.status(400).send("Please enter the email of another user")

    }


    console.log("Updating DB")
    try {

        log({
            file: './routes/auth.js',
            line: '356',
            info: {
                message:'Updating DB to reflect new user priveleges',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)

        const updatedProject = await Project.updateOne(
            {
                name: req.body.projectName
            },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })


        log({
            file: './routes/auth.js',
            line: '379',
            info: {
                message:'Updating forms to reflect new user priveleges',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)

        const updatedForms = await Form.updateMany({
            project: req.body.projectName
        },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        const formsToAdd = await Form.find({
            project: req.body.projectName
        })


        const formIDs = formsToAdd.map((form) => form.name)


        log({
            file: './routes/auth.js',
            line: '408',
            info: {
                message:'Updating user to have new projects and forms',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)

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

        return res.status(200).send(updatedUser)

    } catch (err) {
        return res.status(400).send(err)
    }

})

router.post('/data-collector', auth, async (req, res) => {

    log({
        file: './routes/auth.js',
        line: '408',
        info: {
            message:'Adding data collector',
            data:{
                user_id: req.user._id
            }
        },
        type: 'message'
    }, Log)
    const otherUser = await User.findOne({ "email": req.body.email })
    if (!otherUser) {
        log({
            file: './routes/auth.js',
            line: '455',
            info: {
                message:'User did not exist',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send("User does not exist")
    }

    if (otherUser.roles.dataCollector.includes(req.body.formName)) {
        log({
            file: './routes/auth.js',
            line: '471',
            info: {
                message:'User already a data collector',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send("User is already a data collector for this project")
    }

    if (otherUser._id.toString() === req.user._id) {
        
        return res.status(400).send("Please enter the email of another user")

    }


    try {

        log({
            file: './routes/auth.js',
            line: '493',
            info: {
                message:'Adding form and project details for new data collector',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        const form = await Form.findOne(
            {
                "name": req.body.formName
            })

        const updatedProject = await Project.updateOne(
            {
                name: form.project
            },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        const updatedForms = await Form.updateOne({
            name: req.body.formName
        },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        const updatedUser = await User.updateOne(
            {
                _id: otherUser._id
            },
            {
                $addToSet: {
                    "roles.dataCollector": req.body.formName
                }
            })
            log({
                file: './routes/auth.js',
                line: '539',
                info: {
                    message:'Successfully updated user',
                    data:{
                        user_id: req.user._id
                    }
                },
                type: 'message'
            }, Log)
        return res.status(200).send(updatedUser)

    } catch (err) {

        log({
            file: './routes/auth.js',
            line: '539',
            info: {
                message:'Failed to update user',
                data:{
                    error: err
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send(err)
    }

})

router.post('/analyst', auth, async (req, res) => {

    log({
        file: './routes/auth.js',
        line: '570',
        info: {
            message:'Adding a data analyst',
            data:{
                user_id: req.user._id
            }
        },
        type: 'message'
    }, Log)

    const otherUser = await User.findOne({ "email": req.body.email })
    if (!otherUser) {
        log({
            file: './routes/auth.js',
            line: '586',
            info: {
                message:'User does not exist',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send("User does not exist")
    }

    if (otherUser.roles.analyst.includes(req.body.formName)) {
        log({
            file: './routes/auth.js',
            line: '599',
            info: {
                message:'User is already analyst for this project',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send("User is already an analyst for this project")
    }

    if (otherUser._id.toString() === req.user._id) {
        
        return res.status(400).send("Please enter the email of another user")

    }


    try {
        log({
            file: './routes/auth.js',
            line: '539',
            info: {
                message:'Updating DB to include form and projects of new analyst',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        const form = await Form.findOne(
            {
                "name": req.body.formName
            })

        const updatedProject = await Project.updateOne(
            {
                name: form.project
            },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        const updatedForms = await Form.updateOne({
            name: req.body.formName
        },
            {
                $addToSet: {
                    users: otherUser._id.toString()
                }
            })

        const updatedUser = await User.updateOne(
            {
                _id: otherUser._id
            },
            {
                $addToSet: {
                    "roles.analyst": req.body.formName
                }
            })

        return res.status(200).send(updatedUser)

    } catch (err) {
        log({
            file: './routes/auth.js',
            line: '671',
            info: {
                message:'Failed to add new project analayst',
                data:{
                    user_id: req.user._id
                }
            },
            type: 'message'
        }, Log)
        return res.status(400).send(err)
    }


})


// Delete user
router.delete('/delete', auth, async (req, res) => {
    log({
        file: './routes/auth.js',
        line: '691',
        info: {
            message:'Deleting user',
            data:{
                user_id: req.user._id
            }
        },
        type: 'message'
    }, Log)
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
