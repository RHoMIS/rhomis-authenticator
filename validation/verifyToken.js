const jwt = require('jsonwebtoken')

const log = require('../validation/log');
const Log = require('../models/Log')

// Middle ware function (add to protected routes)

function auth(req, res, next) {
    // Checking if a request has a token
    const token = req.header('Authorization')
    // If token doesn't exist, give access denied
    if (!token) {

        log({
            file: './validation/verifyToken.js',
            line: '14',
            info: {
                message:'Access denied as no token provided',
                data: req.user._id
    
            },
            type: 'message'
        }, Log)

        return res.status(401).send('Access Denied No token provided')
    };
    const currentDate = new Date()

    try {



        const verified = jwt.verify(token, process.env.TOKEN_SECRET);
        console.log(currentDate)
        const expiry = new Date(verified.expiry)

        // Checking whether or not the token has expired
        console.log(expiry < currentDate)
        if (expiry < currentDate) {
            log({
                file: './validation/verifyToken.js',
                line: '40',
                info: {
                    message:'Token expired'
                },
                type: 'message'
            }, Log)
            throw new Error('Token has expired')
        }
        req.user = verified

        log({
            file: './validation/verifyToken.js',
            line: '44',
            info: {
                message:'User successfully logged in',
                data:{
                    'user_id':req.user._id
                }
    
            },
            type: 'message'
        }, Log)


        next();

    } catch (err) {

        log({
            file: './validation/verifyToken.js',
            line: '62',
            info: {
                message:'Unable to log user in ',
                data: err
    
            },
            type: 'message'
        }, Log)

        return res.status(401).send(err.message)
    }
}

module.exports = auth;