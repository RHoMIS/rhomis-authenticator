const router = require('express').Router()
const fs = require('fs')
const axios = require('axios')

const auth = require('../validation/verifyToken')

const Project = require('../models/Project')
const Form = require('../models/Form')
const User = require('../models/User')

const updateAdmins = require('./makeAdmin').updateAdmins


let config = require('config'); //we load the db location from the JSON files
const apiURL = config.get('dataAPI.url')
const { HttpError } = require('../errors/httpError')

const cors = require("cors");
router.use(cors());
router.options("*", cors());

const getCentralToken = require('./centralAuth')
const { param } = require('./auth')

/**
 * Publishes new 'live' version from the current draft of a form.
 * @queryParam project_name 
 * @queryParam form_name
 */
router.post("/publish", auth, async (req, res, next) => {

    // wrap whole thing in try/catch. In async, we can pass the error to next() for Express to handle it:
    // https://expressjs.com/en/guide/error-handling.html#catching-errors
    try {

        // ******************** VALIDATE REQUEST ******************** //
        const validatedReq = validateRequestQuery(req, ['project_name', 'form_name'])

        const project = await Project.findOne({ name: req.query.project_name })
        if (!project) throw new HttpError("Project does not exist in RHoMIS db", 400)

        const project_ID = project.centralID

        // Finding the form and making sure that there is a 
        // a draft form with this name 
        const form = await Form.findOne({ name: req.query.form_name, draft: true})
        if (!form) throw new HttpError("Form does not exist in RHoMIS db", 400)

        // ******************** SEND TO ODK CENTRAL ******************** //
        // Authenticate on ODK central
        const token = await getCentralToken()

        const centralResponse = await axios({
            method: "post",
            url: process.env.CENTRAL_URL + '/v1/projects/' + project_ID + '/forms/' + req.query.form_name + '/draft/publish?version=' + form.formVersion,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
        })
            .catch(function (error) {
                throw error
            })


        // ******************** UPDATE RHOMIS DB ******************** //
        const updated_form = await Form.updateOne(
            {
                name: req.query.form_name,
                project: req.query.project_name
            },
            {
                draft: false,
                live: true,
                liveVersion: form.formVersion,
                draftVersion: null
            }
        )

        console.log(updated_form)

        return res.status(200).send("Form finalized")

    } catch (err) {
        next(err)
    }
})

/**
 * Creates a new draft from a given XLS file. Request body must be the XLS/XLSX form file as a binary file.
 * @queryParam project_name
 * @queryParam form_name
 * @queryParam form_version (optional - defaults to current form.formVersion + 1)
 */
router.post("/new-draft", auth, async (req, res, next) => {
    console.log("user: " + req.user._id)
    console.log("project_name: " + req.query.project_name)
    console.log("form_name: " + req.query.form_name)
    console.log("form_version: " + req.query.form_version)
    try {

        // ******************** VALIDATE REQUEST ******************** //
        //check query has all required params 
        validateRequestQuery(req, ['project_name','form_name'])

        // Find the project and form
        const project = await Project.findOne({ name: req.query.project_name })
        if (!project) throw new HttpError("Could not find project", 400)
    
        // Check if the authenticated user is actually linked to the project under question
        if (!project.users.includes(req.user._id)) throw new HttpError("Authenticated user does not have permissions to modify this project", 401)

        // Check if form exists


        const form = await Form.findOne({ name: req.query.form_name, project: req.query.project_name})
        if (!form) throw new HttpError("Cannot find form to update", 400)

        // If form version doesn't exist in query, increment the existing form_version
        // Need to consider the cases where a draft form exists, where a published form
        // exists, and where both exist.
        let formVersion = null

       
        if (req.query.form_version){
            formVersion = req.query.form_version

        } else if (form.draft==true){   
            if (isNaN(Number(form.draftVersion))){
                formVersion = 1
            }else{
                formVersion === Number(form.draftVersion) + 1
            }


        }

        else if (form.live==true){
            if (isNaN(Number(form.liveVersion))){
                formVersion = 1
            }else{
                formVersion === Number(form.liveVersion) + 1
            }

        }else {
            throw new HttpError("Could not find a version to assign to this form", 500)
        }
        

        // console.log("formVersion")

        // console.log(formVersion)
        // return res.send("debugging")

        // ******************** SEND FORM TO ODK CENTRAL ******************** //
        // Authenticate on ODK central
        const token = await getCentralToken()

        // Load the xls form data from the request
        const data = await converToBuffer(req, res)

        project_ID = project.centralID

        // Send form to ODK central
        const centralResponse = await axios({
            method: "post",
            url: process.env.CENTRAL_URL + '/v1/projects/' + project_ID + '/forms/' + req.query.form_name + '/draft?ignoreWarnings=true',
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'X-XlsForm-FormId-Fallback': req.query.form_name,
                'Authorization': 'Bearer ' + token
            },
            data: data
        })
            .catch(function (error) {
                console.log(error)
                throw error
            })



        // ******************** UPDATE RHOMIS DB ******************** //

        console.log("saving form")
        const formUpdate = await Form.updateOne(
            { 
                name: req.query.form_name, 
                project: req.query.project_name 
            },
            {
                draftVersion: formVersion,
                draft:true
            }
        )

        if (formUpdate.nModified !== 1) throw new HttpError("Form is sent to ODK Central, but could not update formVersion in RHoMIS database", 500)
        
        res.status(200).send("Form successfully updated")

    } catch (err) {
        next(err)
    }
})


/**
 * Creates an entirely new form from a given XLS file. The request body must be the XLS/XLSX form file as a binary file.
 * @queryParam project_name
 * @queryParam form_name (must be unique within the project, and must match the form_id inside the given XLS file)
 * @queryParam publish (optional - defaults to FALSE)
 * @queryParam form_vesrion (optional - defaults to 1)
 */
router.post("/new", auth, async (req, res, next) => {

    console.log("user: " + req.user._id)

    console.log("project_name: " + req.query.project_name)
    console.log("form_name: " + req.query.form_name)
    console.log("form_version: " + req.query.form_version)
    try {
            
        // throw new HttpError('test')
        // ******************** VALIDATE REQUEST ******************** //
        validateRequestQuery(req, ['project_name', 'form_name'])

        // Check which project we are looking for
        const project = await Project.findOne({ name: req.query.project_name })
        if (!project) throw new HttpError("Could not find project with this name", 400)
        
        if (!project.users.includes(req.user._id)) throw new HttpError("Authenticated user does not have permissions to modify this project", 401)


        // Check if form exists
        const form = await Form.findOne({ name: req.query.form_name, project: req.query.project_name })
        if (form) throw new HttpError("There is already a form with this name in the database", 400)

        
        // ******************** PREPARE DATA AND SEND TO ODK CENTRAL ******************** //
        const project_ID = project.centralID
        // const publish = req.query.publish ?? 'false'
        let formVersion = null

        if (req.query.form_version){
            formVersion = req.query.form_version

        } else if (form.draft==true){   
            if (isNaN(Number(form.draftVersion))){
                formVersion = 1
            }else{
                formVersion === Number(form.draftVersion) + 1
            }


        }

        else if (form.live==true){
            if (isNaN(Number(form.liveVersion))){
                formVersion = 1
            }else{
                formVersion === Number(form.liveVersion) + 1
            }

        }else {
            throw new HttpError("Could not find a version to assign to this form", 500)
        }
        // Authenticate on ODK central
        const token = await getCentralToken()

        // Load the xls form data from the request
        const data = await converToBuffer(req, res)

        // Send form to ODK central
        const centralResponse = await axios({
            method: "post",
            url: process.env.CENTRAL_URL + '/v1/projects/' + project_ID + '/forms?ignoreWarnings=true',
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'X-XlsForm-FormId-Fallback': req.query.form_name,
                'Authorization': 'Bearer ' + token
            },
            data: data
        })
            .catch(function (error) {
                throw error
            })


        // *****************  Add an app user and assign to project *****************
        // https://private-709900-odkcentral.apiary-mock.com/v1/projects/projectId/app-users

        const appUserName = "data-collector-" + req.query.form_name
        const appUserCreation = await axios({
            method: "post",
            url: process.env.CENTRAL_URL + '/v1/projects/' + project_ID + '/app-users',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            data: {
                displayName: appUserName
            }
        })
            .catch(function (error) {
                throw error
            })

        const roleID = '2'
        const formID = req.query.form_name
        const appRoleAssignment = await axios({
            method: "post",
            url: process.env.CENTRAL_URL + '/v1/projects/' + project_ID + '/forms/' + req.query.form_name + '/assignments/' + roleID + '/' + appUserCreation.data.id,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
        })
            .catch(function (error) {
                throw error
            })

        const draftDetails = await axios({
            method: "get",
            url: process.env.CENTRAL_URL + '/v1/projects/' + project_ID + '/forms/' + req.query.form_name + "/draft",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
        })
            .catch(function (error) {
                throw error
            })


        // ******************** UPDATE RHOMIS DB ******************** //

        // Add form to projects collection
        const updated_project = await Project.updateOne(
            { name: req.query.project_name },
            { $push: { forms: req.query.form_name } });


        // Add form to user collection
        const updated_user = await User.updateOne(
            { _id: req.user._id },
            {
                $push: {
                    forms: req.query.form_name,
                    "roles.dataCollector": req.query.form_name,
                    "roles.analyst": req.query.form_name
                }
            });

        // Add form to forms collection
        console.log(req.query.project_name)
        console.log(centralResponse.data)

        // const project = await Project.findOne(
        //     { name: req.query.project_name }
        // )
        // if (project.centralID === undefined) {
        //     console.log("could not find centralID of project you are looking for")
        // }

        const formInformation = {
            name: req.query.form_name,
            project: req.query.project_name,
            draftVersion: formVersion,
            users: [req.user._id],
            centralID: centralResponse.data.xmlFormId,
            draft: true,
            live: false,
            complete: false,
            collectionDetails: {
                general: {
                    server_url: process.env.CENTRAL_URL + "/v1/key/" + appUserCreation.data.token + "/projects/" + project.centralID + "/forms/" + req.query.form_name,
                    form_update_mode: "match_exactly",
                    autosend: "wifi_and_cellular"
                },
                project: { name: req.query.project_name },
            },
            draftCollectionDetails: {
                general: {
                    server_url: process.env.CENTRAL_URL + "/v1/test/" + draftDetails.data.draftToken + "/projects/" + project.centralID + "/forms/" + req.query.form_name + "/draft",
                    form_update_mode: "match_exactly",
                    autosend: "wifi_and_cellular"
                },
                project: { name: "[Draft] " + req.query.form_name },
            }


        }

        console.log("formInformation")

        console.log(formInformation)

        // const formDataApi = await axios({
        //     url: apiURL + "/api/meta-data/form",
        //     method: "post",
        //     data: formInformation,
        //     headers: {
        //         'Authorization': req.header('Authorization')
        //     }
        // })

        console.log("saving form")
        savedForm = await new Form(formInformation)
        savedForm.save()

        updateAdmins()

        res.status(200).send("Form successfully created")

        // res.send(centralResponse.data)

    } catch (err) {
        console.log(err)
        next(err)
    }

    return
})






async function converToBuffer(req, res) {
    var data = new Buffer.from('');

    return new Promise((resolve, reject) => {
        req.on('data', function (chunk) {
            data = Buffer.concat([data, chunk]);
        });
        req.on('err', function (err) {
            reject(err)
        })

        req.on('end', () => {
            resolve(data)
        })

    })

}

// Asynchronous file writing
// Based on this: https://stackoverflow.com/questions/16598973/uploading-binary-file-on-node-js
async function writeToFile(req, res) {
    // Creating a new empty buffer
    var data = new Buffer.from('');

    // We listen to the stream of data events
    // We concantenate these events onto the data Buffer
    req.on('data', function (chunk) {
        data = Buffer.concat([data, chunk]);
    });

    // When the data stream ends, we write it to a file
    req.on('end', async function () {

        //This chuck writes to file if needs be
        await fs.writeFile("./survey_modules/node_output.xlsx", data, (err) => {
            if (err) throw err
        });
    })
    res.write("Success in saveing survey file to server \n")
}


// Asynchronous file reading
async function readFile(path) {
    const data = fs.readFileSync(path)
    return data
}

// Check that req.query includes all of the given query parameters
async function validateRequestQuery(req, query_params) {    
    missing = []
    query_params.forEach(item => {
        if (req.query[item] === undefined) missing.push(item)
    });

    if (missing.length > 0) throw new HttpError("Request query must include the following: " + missing.join(','), 400)

    return req
}

module.exports = router;