# RHoMIS 2.0 Authenticator

A JWT based authenticator for the RHoMIS 2 application. The central idea behind this application is that there is server has a "secret". When users are registered they give a username, their email, and a password. The passwords are hashed using bcrypt.

When a user wants to login, they submit their email and password to the server. We check if that email exists. Then we compare the incoming password with the hashed password using bcrypt. If the password is correct, a token is generated. This token is 'digitally signed'. Meaning we pass information in the token that includes information about the user (e.g. username and user_id). To be finished...

## Requirements

To develop locally ensure that you have [MongoDB installed](https://docs.mongodb.com/manual/administration/install-community/). You will also need to have [nodeJS installed](https://nodejs.org/en/download/). 

## Installation

To download clone this repository, run the command:

`git clone git@github.com:l-gorman/rhomis-authenticator.git`

After cloning the repository, you will need to install the dependencies,
This can be done by running the command:

`npm install`

In the main directory (where you find the `routes`, `models`, `test`, and `config` directories)
you will need to create a `.env` file. Copy the `.env.example` and add the values for the given variables.

Note, that if you want to write any application which relies on this authentication API, you will need to
ensure that it uses the same secret to decode web tokens.

## Running the application

There are seperate configuration files for production, development, and testing. This can be found in the `./config` folder. The "scripts" object in the `package.json` file has been modified to include scripts for running the production environment, the development environment, and the testing environment:

* `npm run start-prod` to run the production version of the server
* `npm run start-dev` to run the development version
* `npm run start-test` to run the test version

## Making requests

We only have a few features at the moment. If you would like to make requests, please look
at the [API documentation](https://rhomisauthapi.docs.apiary.io/#reference/0/registration/register-users).

Please note, if you are using the server in development, substitute:

`https://auth.rhomis.cgiar.org/` 

with:

`http://localhost:3002`


## Features to add

* Email based password reset

## Tutorials I used
* JWT authentication implemented using stips outlined in [this tutorial](https://www.youtube.com/watch?v=2jqok-WgelI&ab_channel=DevEd)

* Tutorial for testing [found here](https://www.digitalocean.com/community/tutorials/test-a-node-restful-api-with-mocha-and-chai) and [here](https://buddy.works/tutorials/unit-testing-jwt-secured-node-and-express-restful-api-with-chai-and-mocha
). I relied on the second one the most.

* Tutorials on config [found here](https://www.npmjs.com/package/config)

* Note to see if automatic deployment worked 

# When setting up email AWS

https://help.front.com/t/x17l65/setting-up-sendgrid-spfdkim-dns-records-in-aws

Test email script:

`NODE_ENV=production node test-email.js`