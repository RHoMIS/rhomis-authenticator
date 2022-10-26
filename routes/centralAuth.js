const axios = require('axios')

const log = require('../validation/log');
const Log = require('../models/Log')


async function getCentralAuthToken() {
    try {
        log({
            file: './routes/centralAuth.js',
            line: '9',
            info: {
                message:'Getting central authentication token',
                
            },
            type: 'message'
        }, Log)
        
        const central_token = await axios({
            url: process.env.CENTRAL_URL + "/v1/sessions",
            method: "post",
            data: {
                email: process.env.CENTRAL_EMAIL,
                password: process.env.CENTRAL_PASSWORD
            }
        })
        // console.log(central_token)
        if (central_token.data === undefined) {
            log({
                file: './routes/centralAuth.js',
                line: '30',
                info: {
                    message:'Unable to get central token',
                    
                },
                type: 'message'
            }, Log)
            throw "Could not obtain central auth token"
        }
        if (central_token.data.token === undefined) {
            log({
                file: './routes/centralAuth.js',
                line: '42',
                info: {
                    message:'Unable to get central token',
                    
                },
                type: 'message'
            }, Log)
            throw "Could not obtain central auth token"
        }

        return central_token.data.token
    } catch (err) {
        log({
            file: './routes/centralAuth.js',
            line: '55',
            info: {
                message:'Unable to get central token',
                error:err
            },
            type: 'message'
        }, Log)
        return "Could not obtain central token, err:" + err
    }
}

module.exports = getCentralAuthToken