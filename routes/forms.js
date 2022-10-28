const router = require("express").Router();
const fs = require("fs");
const axios = require("axios");

const auth = require("../validation/verifyToken");

const Project = require("../models/Project");
const Form = require("../models/Form");
const User = require("../models/User");

const updateAdmins = require("./makeAdmin").updateAdmins;

const log = require("../validation/log");
const Log = require("../models/Log");

let config = require("config"); //we load the db location from the JSON files
const apiURL = config.get("dataAPI.url");
const { HttpError } = require("../errors/httpError");

const cors = require("cors");
router.use(cors());
router.options("*", cors());

const getCentralToken = require("./centralAuth");
const { param } = require("./auth");

/**
 * Publishes new 'live' version from the current draft of a form.
 * @queryParam project_name
 * @queryParam form_name
 */
router.post("/publish", auth, async (req, res, next) => {
  // wrap whole thing in try/catch. In async, we can pass the error to next() for Express to handle it:
  // https://expressjs.com/en/guide/error-handling.html#catching-errors
  try {
    // ******************** VALIDATE REQUEST ******************** //

    const validatedReq = await validateRequestQuery(req, [
      "project_name",
      "form_name",
    ]);
    const project = await Project.findOne({ name: req.query.project_name });
    if (!project) {
      log(
        {
          file: "./routes/forms.js",
          line: "44",
          info: {
            message: "Could not create form, project does not exist",
            data: {
              user_id: req.user._id,
            },
          },
          type: "message",
        },
        Log
      );

      throw new HttpError("Project does not exist in RHoMIS db", 400);
    }

    const project_ID = project.centralID;

    // Finding the form and making sure that there is a
    // a draft form with this name
    const form = await Form.findOne({ name: req.query.form_name, draft: true });
    if (!form) throw new HttpError("Form does not exist in RHoMIS db", 400);

    // ******************** SEND TO ODK CENTRAL ******************** //
    // Authenticate on ODK central
    const token = await getCentralToken();

    log(
      {
        file: "./routes/forms.js",
        line: "74",
        info: {
          message: "Finalizing form on ODK central",
          data: {
            user_id: req.user._id,
          },
        },
        type: "message",
      },
      Log
    );

    const centralResponse = await axios({
      method: "post",
      url:
        process.env.CENTRAL_URL +
        "/v1/projects/" +
        project_ID +
        "/forms/" +
        req.query.form_name +
        "/draft/publish?version=" +
        form.draftVersion,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).catch(function (error) {
      console.log(error);
      log(
        {
          file: "./routes/forms.js",
          line: "96",
          info: {
            message: "Could publish form on central",
            data: {
              error: error,
            },
          },
          type: "message",
        },
        Log
      );
      throw error;
    });

    log(
      {
        file: "./routes/forms.js",
        line: "97",
        info: {
          message:
            "Successfully finalized form on ODK central, updating in database",
          data: {
            user_id: req.user._id,
            form: form
          },
        },
        type: "message",
      },
      Log
    );
    // ******************** UPDATE RHOMIS DB ******************** //
    let new_version = String(form.draftVersion)
    const updated_form = await Form.updateOne(
      {
        name: req.query.form_name,
        project: req.query.project_name,
      },
      {
        draft: false,
        live: true,
        liveVersion: new_version,
        draftVersion: null,
      }
    );

    log(
      {
        file: "./routes/forms.js",
        line: "44",
        info: {
          message: "Form finalized",
          data: {
            user_id: req.user._id
          },
        },
        type: "message",
      },
      Log
    );
    return res.status(200).send("Form finalized");
  } catch (err) {
    next(err);
  }
});

/**
 * Creates a new draft from a given XLS file. Request body must be the XLS/XLSX form file as a binary file.
 * @queryParam project_name
 * @queryParam form_name
 * @queryParam form_version (optional - defaults to current form.formVersion + 1)
 */
router.post("/new-draft", auth, async (req, res, next) => {
  log(
    {
      file: "./routes/forms.js",
      line: "151",
      info: {
        message: "Creating new draft form ODK central",
        data: {
          user_id: req.user._id,
          query: req.query
        },
      },
      type: "message",
    },
    Log
  );

  try {
    // ******************** VALIDATE REQUEST ******************** //
    //check query has all required params
    validateRequestQuery(req, ["project_name", "form_name"]);

    // Find the project and form
    const project = await Project.findOne({ name: req.query.project_name });
    if (!project) {
      log(
        {
          file: "./routes/forms.js",
          line: "174",
          info: {
            message: "Could not find project for creating new draft",
            data: {
              user_id: req.user._id
            },
          },
          type: "message",
        },
        Log
      );
      throw new HttpError("Could not find project", 400);
    }

    // Check if the authenticated user is actually linked to the project under question
    if (!project.users.includes(req.user._id)) {
      log(
        {
          file: "./routes/forms.js",
          line: "190",
          info: {
            message: "User does not have access to this project",
            data: {
              user_id: req.user._id
            },
          },
          type: "message",
        },
        Log
      );
      throw new HttpError(
        "Authenticated user does not have permissions to modify this project",
        401
      );
    }

    // Check if form exists

    const form = await Form.findOne({
      name: req.query.form_name,
      project: req.query.project_name,
    });
    if (!form) {
      log(
        {
          file: "./routes/forms.js",
          line: "209",
          info: {
            message: "Cannot create new draft as cannot find form to update",
            data: {
              user_id: req.user._id
            },
          },
          type: "message",
        },
        Log
      );
      throw new HttpError("Cannot find form to update", 400);
    }

    // If form version doesn't exist in query, increment the existing form_version
    // Need to consider the cases where a draft form exists, where a published form
    // exists, and where both exist.

    // Whether to use live or draft version number as basis

    let old_version_number = form.draftVersion ?? form.liveVersion;



    let formVersion = req.query.form_version ?? Number(old_version_number) + 1;

    // console.log("formVersion")

    // console.log(formVersion)
    // return res.send("debugging")

    // ******************** SEND FORM TO ODK CENTRAL ******************** //
    // Authenticate on ODK central
    const token = await getCentralToken();

    // Load the xls form data from the request
    const data = await converToBuffer(req, res);

    project_ID = project.centralID;

    // Send form to ODK central
    log(
      {
        file: "./routes/forms.js",
        line: "245",
        info: {
          message: "Uploading new draft to ODK central",
          data: {
            user_id: req.user._id
          },
        },
        type: "message",
      },
      Log
    );
    const centralResponse = await axios({
      method: "post",
      url:
        process.env.CENTRAL_URL +
        "/v1/projects/" +
        project_ID +
        "/forms/" +
        req.query.form_name +
        "/draft?ignoreWarnings=true",
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-XlsForm-FormId-Fallback": req.query.form_name,
        Authorization: "Bearer " + token,
      },
      data: data,
    }).catch(function (error) {
      log(
        {
          file: "./routes/forms.js",
          line: "151",
          info: {
            message: "Could not load new draft to ODK central",
            data: {
              error: error,
            },
          },
          type: "message",
        },
        Log
      );
      throw error;
    });

    // ******************** UPDATE RHOMIS DB ******************** //

    const draftDetails = await axios({
      method: "get",
      url:
        process.env.CENTRAL_URL +
        "/v1/projects/" +
        project_ID +
        "/forms/" +
        req.query.form_name +
        "/draft",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).catch(function (error) {
      throw error;
    });

    const formUpdate = await Form.updateOne(
      {
        name: req.query.form_name,
        project: req.query.project_name,
      },
      {
        draftVersion: String(formVersion),
        draft: true,
        draftCollectionDetails: {
          general: {
            server_url:
              process.env.CENTRAL_URL +
              "/v1/test/" +
              draftDetails.data.draftToken +
              "/projects/" +
              project.centralID +
              "/forms/" +
              req.query.form_name +
              "/draft",
            form_update_mode: "match_exactly",
            autosend: "wifi_and_cellular",
          },
          project: { name: "[Draft] " + req.query.form_name },
        }
      }
    );

    if (formUpdate.nModified !== 1) {
      log(
        {
          file: "./routes/forms.js",
          line: "151",
          info: {
            message: "Form saved to central, but could not update number in DB",
            data: {
              user_id: req.user._id
            },
          },
          type: "message",
        },
        Log
      );
      throw new HttpError(
        "Form is sent to ODK Central, but could not update formVersion in RHoMIS database",
        500
      );
    }

    res.status(200).send("Form successfully updated");
  } catch (err) {
    log(
      {
        file: "./routes/forms.js",
        line: "151",
        info: {
          message: "Could not create new draft",
          data: {
            error: err.message
          },
        },
        type: "message",
      },
      Log
    );
    next(err);
  }
});

/**
 * Creates an entirely new form from a given XLS file. The request body must be the XLS/XLSX form file as a binary file.
 * @queryParam project_name
 * @queryParam form_name (must be unique within the project, and must match the form_id inside the given XLS file)
 * @queryParam publish (optional - defaults to FALSE)
 * @queryParam form_vesrion (optional - defaults to 1)
 */
router.post("/new", auth, async (req, res, next) => {
  log(
    {
      file: "./routes/forms.js",
      line: "342",
      info: {
        message: "Creating brand new form",
        query: req.query
      },
      type: "message",
    },
    Log
  );
  try {
    // throw new HttpError('test')
    // ******************** VALIDATE REQUEST ******************** //
    validateRequestQuery(req, ["project_name", "form_name"]);

    // Check which project we are looking for
    const project = await Project.findOne({ name: req.query.project_name });
    if (!project) {
      log(
        {
          file: "./routes/forms.js",
          line: "361",
          info: {
            message: "Could not find project to create new form"
          },
          type: "message",
        },
        Log
      );
      throw new HttpError("Could not find project with this name", 400);
    }

    if (!project.users.includes(req.user._id)) {
      log(
        {
          file: "./routes/forms.js",
          line: "378",
          info: {
            message: "User did not have permission to create new form"
          },
          type: "message",
        },
        Log
      );
      throw new HttpError(
        "Authenticated user does not have permissions to modify this project",
        401
      );
    }

    // Check if form exists
    const form = await Form.findOne({
      name: req.query.form_name,
      project: req.query.project_name,
    });
    if (form) {
      log(
        {
          file: "./routes/forms.js",
          line: "395",
          info: {
            message: "Already a form with this name in the db"
          },
          type: "message",
        },
        Log
      );
      throw new HttpError(
        "There is already a form with this name in the database",
        400
      );
    }

    // ******************** PREPARE DATA AND SEND TO ODK CENTRAL ******************** //
    const project_ID = project.centralID;
    // const publish = req.query.publish ?? 'false'

    let formVersion = req.query.form_version ?? 1;

    // Authenticate on ODK central
    const token = await getCentralToken();

    // Load the xls form data from the request
    const data = await converToBuffer(req, res);

    // Send form to ODK central
    const centralResponse = await axios({
      method: "post",
      url:
        process.env.CENTRAL_URL +
        "/v1/projects/" +
        project_ID +
        "/forms?ignoreWarnings=true",
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-XlsForm-FormId-Fallback": req.query.form_name,
        Authorization: "Bearer " + token,
      },
      data: data,
    }).catch(function (error) {
      log(
        {
          file: "./routes/forms.js",
          line: "151",
          info: {
            message: "Could not create new form",
            data: {
              error: error
            },
          },
          type: "message",
        },
        Log
      );
      throw error;
    });

    // *****************  Add an app user and assign to project *****************
    // https://private-709900-odkcentral.apiary-mock.com/v1/projects/projectId/app-users

    const appUserName = "data-collector-" + req.query.form_name;
    const appUserCreation = await axios({
      method: "post",
      url:
        process.env.CENTRAL_URL + "/v1/projects/" + project_ID + "/app-users",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      data: {
        displayName: appUserName,
      },
    }).catch(function (error) {
      log(
        {
          file: "./routes/forms.js",
          line: "479",
          info: {
            message: "Could not add user to ODK central app",
            data: {
              error: error
            },
          },
          type: "message",
        },
        Log
      );
      throw error;
    });

    const roleID = "2";
    const formID = req.query.form_name;
    const appRoleAssignment = await axios({
      method: "post",
      url:
        process.env.CENTRAL_URL +
        "/v1/projects/" +
        project_ID +
        "/forms/" +
        req.query.form_name +
        "/assignments/" +
        roleID +
        "/" +
        appUserCreation.data.id,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).catch(function (error) {
      log(
        {
          file: "./routes/forms.js",
          line: "507",
          info: {
            message: "Could not change app user assignment",
            data: {
              error: error
            },
          },
          type: "message",
        },
        Log
      );
      throw error;
    });

    const draftDetails = await axios({
      method: "get",
      url:
        process.env.CENTRAL_URL +
        "/v1/projects/" +
        project_ID +
        "/forms/" +
        req.query.form_name +
        "/draft",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
    }).catch(function (error) {
      throw error;
    });

    // ******************** UPDATE RHOMIS DB ******************** //

    // Add form to projects collection
    const updated_project = await Project.updateOne(
      { name: req.query.project_name },
      { $push: { forms: req.query.form_name } }
    );

    // Add form to user collection
    const updated_user = await User.updateOne(
      { _id: req.user._id },
      {
        $push: {
          forms: req.query.form_name,
          "roles.dataCollector": req.query.form_name,
          "roles.analyst": req.query.form_name,
        },
      }
    );

    // Add form to forms collection

    // const project = await Project.findOne(
    //     { name: req.query.project_name }
    // )
    // if (project.centralID === undefined) {
    //     console.log("could not find centralID of project you are looking for")
    // }

    const formInformation = {
      name: req.query.form_name,
      project: req.query.project_name,
      draftVersion: String(formVersion),
      users: [req.user._id],
      centralID: centralResponse.data.xmlFormId,
      draft: true,
      live: false,
      complete: false,
      collectionDetails: {
        general: {
          server_url:
            process.env.CENTRAL_URL +
            "/v1/key/" +
            appUserCreation.data.token +
            "/projects/" +
            project.centralID,
          form_update_mode: "match_exactly",
          autosend: "wifi_and_cellular",
        },
        project: { name: req.query.project_name },
      },
      draftCollectionDetails: {
        general: {
          server_url:
            process.env.CENTRAL_URL +
            "/v1/test/" +
            draftDetails.data.draftToken +
            "/projects/" +
            project.centralID +
            "/forms/" +
            req.query.form_name +
            "/draft",
          form_update_mode: "match_exactly",
          autosend: "wifi_and_cellular",
        },
        project: { 
          name: "[Draft] " + req.query.form_name,
          icon: "ð" 
        },
        admin:{}
      },
    };

    // const formDataApi = await axios({
    //     url: apiURL + "/api/meta-data/form",
    //     method: "post",
    //     data: formInformation,
    //     headers: {
    //         'Authorization': req.header('Authorization')
    //     }
    // })

    savedForm = await new Form(formInformation);
    savedForm.save();

    updateAdmins();
    log(
      {
        file: "./routes/forms.js",
        line: "151",
        info: {
          message: "Successfully created new form",
          data: {
            error: req.user._id,
          },
        },
        type: "message",
      },
      Log
    );
    res.status(200).send("Form successfully created");

    // res.send(centralResponse.data)
  } catch (err) {
    log(
      {
        file: "./routes/forms.js",
        line: "151",
        info: {
          message: "Could not create new form",
          data: {
            error: err
          },
        },
        type: "message",
      },
      Log
    );
    next(err);
  }

  return;
});

async function converToBuffer(req, res) {
  var data = new Buffer.from("");

  return new Promise((resolve, reject) => {
    req.on("data", function (chunk) {
      data = Buffer.concat([data, chunk]);
    });
    req.on("err", function (err) {
      reject(err);
    });

    req.on("end", () => {
      resolve(data);
    });
  });
}

// Asynchronous file writing
// Based on this: https://stackoverflow.com/questions/16598973/uploading-binary-file-on-node-js
async function writeToFile(req, res) {
  // Creating a new empty buffer
  var data = new Buffer.from("");

  // We listen to the stream of data events
  // We concantenate these events onto the data Buffer
  req.on("data", function (chunk) {
    data = Buffer.concat([data, chunk]);
  });

  // When the data stream ends, we write it to a file
  req.on("end", async function () {
    //This chuck writes to file if needs be
    await fs.writeFile("./survey_modules/node_output.xlsx", data, (err) => {
      if (err) throw err;
    });
  });
  res.write("Success in saveing survey file to server \n");
}

// Asynchronous file reading
async function readFile(path) {
  const data = fs.readFileSync(path);
  return data;
}

// Check that req.query includes all of the given query parameters
async function validateRequestQuery(req, query_params) {
  missing = [];
  query_params.forEach((item) => {
    if (req.query[item] === undefined) missing.push(item);
  });

  if (missing.length > 0)
    throw new HttpError(
      "Request query must include the following: " + missing.join(","),
      400
    );

  return req;
}

module.exports = router;
