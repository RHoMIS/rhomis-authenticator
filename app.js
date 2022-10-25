const express = require('express');
const app = express();
const nodemailer = require('nodemailer');
const mongoose = require('mongoose')

const dotenv = require('dotenv')

const Log = require('./models/Log')


function getEnvFile(nodeEnv){
    if (process.env.NODE_ENV==="test"){
        return ".env.test"
    }else{
        return ".env"
    }
}

var envFile = getEnvFile(process.env.NODE_ENV)



dotenv.config({path: envFile})





// Import Routes
const authRoute = require('./routes/auth')
const projectsRoute = require('./routes/projects')
const formRoute = require('./routes/forms')
const metaDataRoute = require('./routes/metaData')
const adminRoute = require('./routes/makeAdmin').router
const testEmailRoute = require('./routes/email-test')


// Rate limiting
const rateLimit = require("express-rate-limit");

// Enable if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)
// see https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', 1);

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000
});
app.use(apiLimiter);



// Getting information from the config files
let config = require('config'); //we load the db location from the JSON files

console.log('Running "' + config.util.getEnv('NODE_ENV') + '" environment')
let dbHost = config.get('dbConfig.host')
let port = config.get('dbConfig.port')



var connectWithRetry = function () {
    return mongoose.connect(dbHost, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }, function (err) {
        if (err) {
            console.error('Failed to connect to mongo on startup - retrying in 5 sec \n ', err);
            setTimeout(connectWithRetry, 5000);
        }
    });

}
connectWithRetry()

const db = mongoose.connection;
db.once("open", (_) => {
    console.log("Database connected:", dbHost);
});
// Ensuring that queries are not limited by size
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware
// Add this to allow us to use post requests with JSON
app.use(express.json())

// Route Middlewares
app.use('/api/user/', authRoute)
app.use('/api/projects/', projectsRoute)
app.use('/api/forms/', formRoute)
app.use('/api/meta-data/', metaDataRoute)
app.use('/api/admin/', adminRoute)
// Using the reate limiting
app.use("/api/user", apiLimiter);
app.use("/api/email-test", testEmailRoute)

/**
 *  Add error handling:
 *   - uses 
 *   - in test + dev, return the full error stack trace (via the default Express error handler)
 *   - in prod, return custom error message
 *  https://expressjs.com/en/guide/error-handling.html#writing-error-handlers
 */
app.use((err, req, res, next) => {
    // must also use default error handler if headers are already sent
    if (res.headersSent || process.env.NODE_ENV !== 'production') {
        return next(err)
    }
    res.status(err.status ?? 500).send(err.message)
})

app.get('/', function (req, res) {
    res.send("Welcome to RHoMIS Authenticator")
})

app.get('/logs', async (req, res) => {

    let header = `
    <!DOCTYPE html>
    <html>
    <body>
    <pre id="json"></pre>

    <script>
    

    
    
    var data =
    `


    let footer = `
    document.getElementById("json").textContent = JSON.stringify(data, undefined, 2);

  </script>

</body>
</html>
    `

    const logs = await Log.find({}).
        sort('-time').
        limit(11)
    
     let middle = JSON.stringify(logs) 

     res.send(header+middle+footer)

   
})
 

app.listen(port, () => console.log('Server up and running on port ' + port))


const initAdmin = require('./routes/makeAdmin').initAdmin
initAdmin()


module.exports = app; // This needs to be exported for testing
