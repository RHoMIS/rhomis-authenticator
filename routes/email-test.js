const router = require('express').Router();

const CreateTransporter = require('../email-transporter/email-transporter')

const log = require('../validation/log');
const Log = require('../models/Log')

const cors = require("cors");


router.use(cors());
router.options("*", cors());

router.get("/", (req, res) => {

    transporter = CreateTransporter()

    var mailOptions = {
        from: process.env.SMTP_EMAIL, // sender address (who sends)
        to: 'lg14410@bristol.ac.uk', // list of receivers (who receives)
        subject: 'Hello from api endpoint', // Subject line
        text: 'Hello world ', // plaintext body
        html: 'This email was send by accessing the api endpoint' // html body
    };

    transporter.verify(function (error, success) {
        if (error) {
            console.log("transporter error")
            console.log(error)
        } else {
            console.log("Server ready for messages")
        }
    })

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            return console.log(error);
        }

        console.log('Message sent: ' + info.response);
    });

    res.status(200).send("We will send emails from here")
})


module.exports = router
