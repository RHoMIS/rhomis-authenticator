#!/usr/bin/env node

// For the correct environment run with prefix
// NODE_ENV=<dev|prod|test>
// e.g. 
// NODE_ENV=dev node migrations/update-finalised-form-details-12-07-2022.js
const GetConfigDetailsAndConnect = require('./setup.js')
const mongoose = require('mongoose')

const Form = require('../models/Form')

// RunScript('./migrations/setup.js', function (err) {
//     if (err) throw err;
//     console.log('Finished Running Setup');
// });

const db = GetConfigDetailsAndConnect()


async function run(db) {

    

    // If form is currently marked as draft true
    // Need to set 'live' to false

    const finalisedForms = await Form.find({live:true})


    finalisedForms.forEach(async (form)=>{


        const UpdatedFinalForms = await Form.updateOne(
            {name: form.name, project: form.project},    
            { $set: { "collectionDetails.general.server_url": form.collectionDetails.general.server_url + "/forms/" + form.name },
            draftVersion:null}
        )

    })


    const forms =  await Form.find()
    console.log(forms)
 

    db.close()



    return     
}

run(db)













