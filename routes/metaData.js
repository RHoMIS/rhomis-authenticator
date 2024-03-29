const router = require('express').Router()
const fs = require('fs')
const axios = require('axios')

const auth = require('../validation/verifyToken')


const User = require('../models/User')
const Form = require('../models/Form')
const Project = require('../models/Project')

const getCentralAuthToken = require('./centralAuth')

const cors = require("cors");
router.use(cors());
router.options("*", cors());


const log = require('../validation/log');
const Log = require('../models/Log')



router.post("/", auth, async (req, res) => {
    
    // write file then read it
    //const writeStatus = await writeToFile(req, res)
    //const data = await readFile("./survey_modules/node_output.xlsx")


    try {
        const user = await User.findOne({ _id: req.user._id }, 'projects forms roles -_id')

        const projects = await Project.find({ users: req.user._id })
        // const projects = await Project.find({})
        const forms_found = await Form.find({ users: req.user._id })

        let forms = JSON.parse(JSON.stringify(forms_found))

     
        if (req.body.getSubmissionCount === true) {
            if (req.body.projectName)
            {
            for (let form_index = 0; form_index < forms.length; form_index++) {

                let projectName = forms[form_index].project
                if (projectName===req.body.projectName)
                {

                    forms[form_index].submissions = await getSubmissionCounts({
                        projectName: forms[form_index].project,
                        formName: forms[form_index].name
                    })
                }

            }
        }
        }



        // const forms = await Form.find({})

        const result = {
            user: user,
            projects: projects,
            forms: forms
        }
        log({
            file: './routes/metaData.js',
            line: '73',
            info: {
                message:'Successfully retrieved user info'
                
                
            },
            type: 'message'
        }, Log)

        res.status(200).send(result)


    } catch (err) {
        log({
            file: './routes/metaData.js',
            line: '88',
            info: {
                message:'Could not retrieve user information',
                error:err
                
            },
            type: 'message'
        }, Log)
        res.status(400).send(err)
    }
})


async function getSubmissionCounts(props) {
    const project = await Project.findOne({ "name": props.projectName })
    const form = await Form.findOne({ "project": props.projectName, "name": props.formName })


    const url = BuildSubmissionURL({
        form: form,
        project: project
    })


    const token = await getCentralAuthToken()

    let submissions = {
        live:null,
        draft:null
    }

    if (form.draft==true){
    const centralResponseDraft = await axios({
        method: "get",
        url: url.draft,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
    })
        .catch(function (error) {
            log({
                file: './routes/metaData.js',
                line: '132',
                info: {
                    message:'Could not get count of central submissions',
                    error:error
                    
                },
                type: 'message'
            }, Log)
            throw error
        })
        submissions.draft = centralResponseDraft.data.length


    }
    if (form.live===true){

        const centralResponseLive = await axios({
            method: "get",
            url: url.live,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
        })
            .catch(function (error) {
                throw error
            })


            submissions.live = centralResponseLive.data.length

        }
    return submissions

}

function BuildSubmissionURL(props) {

    let submission_urls = {
        live: process.env.CENTRAL_URL + '/v1/projects/' + props.project.centralID + '/forms/' + props.form.centralID + '/submissions',
        draft: process.env.CENTRAL_URL + '/v1/projects/' + props.project.centralID + '/forms/' + props.form.centralID + '/draft/submissions'
    }

    return submission_urls
}

module.exports = router

