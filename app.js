var restify = require('restify');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var config = require('config');
var request = require('request');
var jwt = require('restify-jwt');
var secret = require('dvp-common/Authentication/Secret.js');
var authorization = require('dvp-common/Authentication/Authorization.js');
var format = require("stringformat");
var validator = require('validator');
var port = config.Host.port || 3000;
var host = config.Host.vdomain || 'localhost';

var buyPackage = require("./billapi/functions/buypackage");
var ratings = require("./billapi/functions/ratings");
var validateToken = require("./billapi/functions/validatetoken");

var billing = require("./Core/scheduler");

var server = restify.createServer({
  name: "DVP Billing Service"
});

process.on('uncaughtException',function(err){
  logger.log("UNCAUGHT EXCEPTION");
  logger.log(err.stack);
});

server.pre(restify.pre.userAgentConnection());
server.use(restify.bodyParser({ mapParams: false }));

restify.CORS.ALLOW_HEADERS.push('authorization');
server.use(restify.CORS());
server.use(restify.fullResponse());

//server.use(jwt({secret: secret.Secret}));

var msg = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');


var token = format("Bearer {0}",config.Services.accessToken);
//////////////////////////////Cloud API/////////////////////////////////////////////////////



server.post('/DVP/API/:version/Billing/BuyPackage',authorization({resource:"billing", action:"write"}), buyPackage.execute);
server.post('/DVP/API/:version/Billing/updateRatings',authorization({resource:"billing", action:"write"}), ratings.updateRatings);
server.post('/DVP/API/:version/Billing/validateToken', validateToken.validateToken);




server.listen(port, function () {

  billing.bill();
  logger.info("DVP-Billingservice.main Server %s listening at %s", server.name, server.url);

});


