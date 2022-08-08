console.log('Running subscript')

const mongoose = require('mongoose')
const dotenv = require('dotenv')
let config = require('config'); //we load the db location from the JSON files


function getEnvFile(nodeEnv){
    if (process.env.NODE_ENV==="test"){
        return ".env.test"
    }else{
        return ".env"
    }
}

function GetConfigDetailsAndConnect(){
    var envFile = getEnvFile(process.env.NODE_ENV)
    dotenv.config({path: envFile})
    console.log('Running "' + config.util.getEnv('NODE_ENV') + '" environment')

    let dbHost = config.get('dbConfig.host')
    let port = config.get('dbConfig.port')
    console.log(config.get('dataAPI.url'))

    mongoose.connect(dbHost, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
    
    const db = mongoose.connection;
    db.once("open", (_) => {
        console.log("Database connected:", dbHost);
    });

    return db;

}

module.exports= GetConfigDetailsAndConnect








//=------------------------------
//=------------------------------
//=------------------------------
//=------------------------------
// If want to make into command line script with flags

// Allowing command line arguments
// --env indicates which environment you are running the migration for
// The options should be

//const { exit } = require('yargs')

// const yargs = require('yargs');
// var argv = require('yargs/yargs')(process.argv.slice(2))
//     .usage('Usage: $0 <command> [options]')
//     .command('migrate', 'Migrate db to contain live featur in forms')
//     .alias('e', 'env')
//     .default('env', "dev")
//     .describe('e', 'The environment you are working with')
//     .alias('h', 'help')
//     .demandOption(['env'])
//     .help('h')
//     .argv;

// console.log("Node Environment:")
// console.log(argv.env);