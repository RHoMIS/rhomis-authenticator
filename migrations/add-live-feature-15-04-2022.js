#!/usr/bin/env node

// For the correct environment run with prefix
// NODE_ENV=<dev|prod|test>
// e.g. 
// NODE_ENV=dev node migrations/add-live-feature-15-04-2022.js
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
    const UpdatedDraftForms = await Form.updateMany(
        {draft: true},    
        {live:false} 
    )

    // If form is currently marked as draft false
    // Need to set 'live' to true
    const UpdatedFinalForms = await Form.updateMany(
        {draft: false},    
        {live:true} 
    )

    const forms =  await Form.find()
    console.log(forms)
 

    db.close()



    return     
}

run(db)













