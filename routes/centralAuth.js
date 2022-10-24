const axios = require('axios')

const log = require('../validation/log');
const Log = require('../models/Log')


async function getCentralAuthToken() {
    try {
        const central_token = await axios({
            url: process.env.CENTRAL_URL + "/v1/sessions",
            method: "post",
            data: {
                email: process.env.CENTRAL_EMAIL,
                password: process.env.CENTRAL_PASSWORD
            }
        })
        // console.log(central_token)
        if (central_token.data === undefined) throw "Could not obtain central auth token"
        if (central_token.data.token === undefined) throw "Could not obtain central auth token"

        return central_token.data.token
    } catch (err) {
        return "Could not obtain central token, err:" + err
    }
}

module.exports = getCentralAuthToken