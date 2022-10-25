const auth = require("../validation/verifyToken")
const router = require('express').Router()
const jwt = require('jsonwebtoken');
const axios = require('axios')

const updateAdmins = require('./makeAdmin').updateAdmins

const cors = require("cors");
router.use(cors());
router.options("*", cors());

let config = require('config'); //we load the db location from the JSON files
const apiURL = config.get('dataAPI.url')


const User = require('../models/User');
const Project = require('../models/Project');
const Form = require('../models/Form');

const getCentralToken = require('./centralAuth')



const log = require('../validation/log');
const Log = require('../models/Log')


router.post("/create", auth, async (req, res) => {
    // Authenticate for central server`

    const central_token = await getCentralToken()

    // Make sure there is a "name" argument provided in the request
    if (!req.body.name) {

        return res.status(400).send("Need to include project name to create project")
    }

    if (req.body.name.length===0) {
        return res.status(400).send("Need to include project name to create project")
    }
    
    // if (!req.body.description) {
    //     console.log("Project description not included in request")
    //     return res.send("Need to include project name to create project")
    // }

    // Check if project exists in local mongoDb
    const projectExist = await Project.findOne({ name: req.body.name })
    if (projectExist) {
        return res.status(400).send('Project already exists, please select a different name')
    }

    // Check if project exists in ODK central
    const projectResultCentral = await axios({
        url: process.env.CENTRAL_URL + "/v1/projects",
        method: "get",
        headers: {
            'Authorization': 'Bearer ' + central_token
        }
    })

    const projectExistsCentral = projectResultCentral.data.filter(project => project.name === req.body.name)
    if (projectExistsCentral.length > 0) {
        return res.status(400).send("Project already exists in Central database. Please choose another project name")
    }
    try {
        //Create a project on Central 
        const projectCreationResult = await axios({
            url: process.env.CENTRAL_URL + "/v1/projects",
            method: "post",
            data: {
                name: req.body.name
            },
            headers: {
                'Authorization': 'Bearer ' + central_token
            }
        })
        // Check if the request returned a project with the Central ID
        if (projectCreationResult.data.id === undefined) {
            throw ("error in creating central project")
        }
        const projectInformation = {
            name: req.body.name,
            description: req.body.description,
            centralID: projectCreationResult.data.id,
            users: [req.user._id],
            forms: []
        }

        // const projectCreateDataApi = await axios({
        //     url: apiURL + "/api/meta-data/project",
        //     method: "post",
        //     data: projectInformation,
        //     headers: {
        //         'Authorization': req.header('Authorization')
        //     }
        // })

        // Save the new project in the database

        const savedProject = await new Project(projectInformation)
        const saveResult = await savedProject.save()

        //LINK THE USER CREATING THE PROJECT, TO THEIR PROJECT
        // Finding user all user information
        // const user = await User.findOne({ _id: req.user._id })
        const updated_user = await User.updateOne(
            { _id: req.user._id },
            {
                $push: {
                    projects: req.body.name,
                    "roles.projectManager": req.body.name,
                }
            }, {
            upsert: true
        }
        );
        updateAdmins()
        return res.status(200).send("Project Saved")
    } catch (err) {
        log({
            file: './routes/projects.js',
            line: '122',
            info: {
                message:'Could not create new project',
                data:{
                    error: err
                }
                
            },
            type: 'message'
        }, Log)
        return res.status(400).send(err)
    }
})

// Delete Project
router.delete("/delete", auth, async (req, res) => {
    console.log("Logging into central")
    const central_token = await getCentralToken()

    if (!req.body.name) {
        console.log("Project name not included in request")

        return res.status(400).send("Need to include project name to create project")
    }

    // Find project in database
    console.log("Finding project in database")

    const project = await Project.findOne({ name: req.body.name })
    if (!project) {
        console.log("Project does not exist in database")

        return res.status(400).send("Project does not exist in database")
    }

    // Check for project in ODK central
    console.log("Checking for project in ODK central")
    const centralProjects = await axios({
        url: process.env.CENTRAL_URL + "/v1/projects",
        method: "get",
        headers: {
            'Authorization': 'Bearer ' + central_token
        }
    })

    const matchedProjects = centralProjects.data.filter(project => project.name == req.body.name)

    if (matchedProjects == 0) {
        console.log("Project does not exist in ODK central")
        return res.status(400).send("Project does not exist in ODK central")
    }
    if (matchedProjects > 1) {
        console.log("More than one project with this name")
        return res.status(400).send("More than one project with this name")
    }

    const centralID = matchedProjects[0].id

    try {
        // Delete the project on central
        console.log("Deleting the project on ODK central")
        const centralDeleteResult = await axios({
            url: process.env.CENTRAL_URL + "/v1/projects/" + centralID,
            method: "delete",
            headers: {
                'Authorization': 'Bearer ' + central_token
            }

        })


        // Delete forms associated with a project from the User collection
        console.log("Finding the forms to delete which are associated with the project")
        const forms = await Form.find({}, "name -_id")
        const formsToDelete = forms.map((form) => form.name)

        console.log("Deleting the forms from user")
        const modifiedUsers = await User.updateMany(
            {},
            {
                $pull: {
                    forms: { $in: formsToDelete },
                    "roles.dataCollector": { $in: formsToDelete },
                    "roles.analyst": { $in: formsToDelete }

                }
            }
        )

        // Delete projects from the user collection
        console.log("Deleting the projects from the user")
        const projectDeleteUser = await User.updateMany(
            {},
            {
                $pull: {
                    projects: req.body.name,
                    "roles.projectManager": req.body.name,
                }
            })


        // Delete forms associated with project from the forms collection
        console.log("Deleting forms")
        const deletedForms = await Form.deleteMany({ project: req.body.name })
        console.log(deletedForms)

        // Delete the project from the database
        console.log("Deleting projects")
        const projectToDelete = await Project.deleteOne({ name: req.body.name })

        // Deleting processed data
        console.log("Deleting projects from the data API")
        // const deletedProcessedData = await axios({
        //     url: apiURL + "/api/delete-project",
        //     method: "delete",
        //     data: {
        //         "projectName": req.body.name
        //     },
        //     headers: {
        //         'Authorization': req.header('Authorization')
        //     }
        // })

        updateAdmins()

        console.log("done")
        return res.status(200).send(projectToDelete)

    } catch (err) {
        log({
            file: './routes/forms.js',
            line: '361',
            info: {
                message:'Could not delete project',
                data:{
                    error: err
                }
                
            },
            type: 'error'
        }, Log)
        return res.status(400).send(err)
    }
})

// Assign user
router.post("/assign", auth, (req, res) => {
    const central_token = getCentralToken()

    res.send("")
})

// Assign user
router.post("/unassign", auth, (req, res) => {
    const central_token = getCentralToken()

    res.send("")
})

module.exports = router;