const nodemailer = require("nodemailer");

var mailConfig;

if (process.env.NODE_ENV === 'production' ){
    // all emails are delivered to destination
    mailConfig = {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    };
} else {
    // all emails are catched by ethereal.email
    mailConfig = {
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
            user: 'noelia.lindgren87@ethereal.email',
            pass: 'X98fAJwQX29rsprsTT'
        }
    };
}

console.log(mailConfig)

let transporter = nodemailer.createTransport(mailConfig);

transporter.sendMail({
    from: '"Fred Foo 👻" <foo@example.com>', // sender address
    to: "bar@example.com, baz@example.com", // list of receivers
    subject: "Hello ✔", // Subject line
    text: "Hello world?", // plain text body
    html: "<b>Hello world?</b>", // html body
  }).then(info=>{
    console.log('Preview URL: ' + nodemailer.getTestMessageUrl(info));
});