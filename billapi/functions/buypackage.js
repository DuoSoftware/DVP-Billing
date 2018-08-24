/**
 * Created by Kalana on 11/18/2016.
 *
 * READE ME :
 * PROCESS : 1. User calls endpoint to create new package
 *           2. Service calls package API to get price of selected package
 *           3. Service sends amount to paymentAPI
 *           4. Logic difference from upgrade :- if no credit just deny registration and respond failure,
 *                                               if available add credit to wallet and respond success message
 *           5. Add to billing scheduler array
 *
 */


var format = require("stringformat");
var config = require('config');
var restify = require('restify');
var validator = require('validator');
var request = require('request');
var PublishToQueue = require('../../Control/Worker').PublishToQueue;
var DBconn = require('../../Control/DbHandler');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var msg = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var token = format("Bearer {0}",config.Services.accessToken);

function execute(req,res,next){

    var company =req.user.company;
    //var company ='103';
    var tenant = req.user.tenant;

    console.log(req.body);

    if(config.Host.userBilling == "true"){
        var walletURL = format("http://{0}/DVP/API/{1}/PaymentManager/Customer/Wallet/Credit",  config.Services.walletServiceHost,  config.Services.walletServiceVersion);
        if (validator.isIP(config.Services.walletServiceHost)) {
            //wallerURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/"+userid+"/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);
            walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);

        }
        //walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit",  config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);

        var date = new Date();
        var day  = date.getDate();
        var month  = date.getMonth();
        var year  = date.getYear();



        var remaining_days = 30-day;
        var email = req.body.email;
        var packgedetails = req.body;
        packgedetails.id = tenant+"."+company+"."+month+"."+year;
        //console.log(req.body);
        console.log(req.headers.authorization);

        var amount = 0;
        if(req.body.setupFee)
            amount = (((req.body.unitPrice) * (req.body.units) * remaining_days)/30)+req.body.setupFee;
        else
            amount = ((req.body.unitPrice) * (req.body.units) * remaining_days)/30;

        console.log(req.body.unitPrice);
        console.log(req.body.units);
        console.log(remaining_days);

        amount = amount*100;

        logger.info('[BUY PACKAGE]:Amount to be deducted - %s ', amount);

        request({
            method: "PUT",
            url: walletURL,
            headers: {
                Authorization: req.headers.authorization,
                companyinfo: format("{0}:{1}", tenant , company)
            },
            json: {"Amount": amount, "Reason": req.body.name+':'+req.body.type, "name":req.body.username}
        }, function (_error, _response, datax) {
            //console.log(datax);
            if (datax && datax.IsSuccess) {

                var date = new Date();
                var month  = date.getMonth();

                //Save to Database
                var customer = {};
                customer.customer = company;
                customer.email = req.body.email;
                customer.status = true;
                customer.subscriptions = JSON.stringify(packgedetails);
                customer.tenant = tenant;
                customer.company = company;
                customer.cycle = month;
                customer.data = [];
                var obj = {};
                obj[month] = packgedetails;
                customer.data.push(obj);

                DBconn.CustomerCycleById(customer, function(err,obj){

                    if(err){
                        console.log(err);


                    }
                    else{

                        if(!JSON.parse(obj).IsSuccess){
                            console.log('New Record Created');
                            DBconn.CreateCustomerBillRecord(customer, function(err,obj){
                                if(err){

                                    var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", true, customer);
                                    res.end(jsonString);
                                }
                                else{
                                    var sendObj = {
                                        "company": 0,
                                        "tenant": 1
                                    };

                                    var date = new Date();
                                    var month = date.getMonth();
                                    var year = date.getYear();

                                    if(amount!=0){
                                        sendObj.to =  email;
                                        //sendObj.to =  "kalana@duosoftware.com";
                                        sendObj.from = "Billing";
                                        sendObj.subject = "Billing";
                                        sendObj.template = "Billing Information";
                                        sendObj.Parameters =
                                        {
                                            username:email,
                                            totalbill:amount,
                                            id:tenant+"."+company+"."+month+"."+year,
                                            created_at:date,
                                            company : '',
                                            owner : '',
                                            mail : email,
                                            billinginfo:packgedetails
                                        };
                                        //sendObj.attachments = [{name:name, url:url}]

                                        PublishToQueue("EMAILOUT", sendObj);


                                    }


                                    var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, obj);
                                    res.end(jsonString);
                                }
                            });
                        }
                        else{
                            console.log('Old Record Updated');
                            var object = JSON.parse(obj);
                            if(object.Result.OtherJsonData !=null){
                                var actualJson = object.Result.OtherJsonData;
                                var obj = {};
                                obj[month] = packgedetails;
                                actualJson.push(obj);
                                customer.data = actualJson;
                            }
                            else{
                                var obj = {};
                                obj[month] = packgedetails;
                                customer.data = obj;
                            }


                            DBconn.UpdateCustomerBillRecord(customer, function(err,obj){
                                if(err){
                                    var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, customer);
                                    res.end(jsonString);
                                }
                                else{

                                    var sendObj = {
                                        "company": 0,
                                        "tenant": 1
                                    };

                                    var date = new Date();
                                    var month = date.getMonth();
                                    var year = date.getYear();

                                    if(amount!=0){
                                        sendObj.to =  email;
                                        //sendObj.to =  "kalana@duosoftware.com";
                                        sendObj.from = "Billing";
                                        sendObj.subject = "Billing";
                                        sendObj.template = "Billing Information";
                                        sendObj.Parameters =
                                        {
                                            username:email,
                                            totalbill:amount,
                                            id:tenant+"."+company+"."+month+"."+year,
                                            created_at:date,
                                            company : '',
                                            owner : '',
                                            mail : email,
                                            billinginfo:packgedetails
                                        };
                                        //sendObj.attachments = [{name:name, url:url}]

                                        PublishToQueue("EMAILOUT", sendObj);


                                    }

                                    var message = msg.FormatMessage(undefined, "Package bought", true, obj);
                                    logger.info('[BUY PACKAGE]:SUCCESS - %s ', JSON.stringify(obj));
                                    res.write(message);
                                    res.end();
                                }
                            });
                        }

                    }

                });

            }
            else {

                var message = msg.FormatMessage(undefined, "Unsuccessful Payment", false, datax);
                logger.error('[BUY PACKAGE]:ERROR - %s ', JSON.stringify(datax));
                res.write(message);
                res.end();
            }


        });

    }
    else if(config.Host.tenantBilling == "true"){

        var date = new Date();
        var day  = date.getDate();
        var month  = date.getMonth();
        var year  = date.getYear();



        var remaining_days = 30-day;
        if(remaining_days ==-1 || remaining_days ==0){
            remaining_days = 1;
        }
        var email = req.body.email;
        var packgedetails = req.body;
        packgedetails.id = tenant+"."+company+"."+month+"."+year;
        //console.log(req.body);
        console.log(req.body.unitPrice);
        console.log(req.body.units);
        console.log(req.body.setupFee);


        var date = new Date();
        var month  = date.getMonth();

        //Save to Database
        var customer = {};
        customer.customer = company;
        customer.email = email;
        customer.status = true;
        customer.subscriptions = '';
        customer.tenant = tenant;
        customer.company = company;
        customer.cycle = -1;
        customer.firstbilling = true;
        customer.buydate = date.toString();
        customer.data = [];
        var obj = {};
        obj[month] = packgedetails;
        customer.data.push(obj);

        console.log(date);

        DBconn.CustomerCycleById(customer, function(err,obj){
            var jsonString = '';
            if(err){
                console.log(err);
            }
            else{

                if(!JSON.parse(obj).IsSuccess){
                    console.log('New Record Created');
                    console.log(JSON.stringify(customer));
                    DBconn.CreateCustomerBillRecord(customer, function(err,obj){
                        if(err){

                            jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", true, customer);
                            res.end(jsonString);
                        }
                        else{
                            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, obj);
                            res.end(jsonString);
                        }
                    });
                }
                else{
                    //var obj = {};
                    console.log('Old Record Updated');
                    var object = JSON.parse(obj);
                    if(object.Result !=undefined && object.Result.OtherJsonData !=null){
                        var actualJson = object.Result.OtherJsonData;
                        obj = {};
                        obj[month] = packgedetails;
                        actualJson.push(obj);
                        customer.data = actualJson;
                    }
                    else{
                        obj = {};
                        obj[month] = packgedetails;
                        customer.data = obj;
                    }


                    DBconn.UpdateCustomerBillRecord(customer, function(err,obj){
                        if(err){
                            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, customer);
                            res.end(jsonString);
                        }
                        else{

                            var message = msg.FormatMessage(undefined, "Package bought", true, obj);
                            logger.info('[BUY PACKAGE]:SUCCESS - %s ', JSON.stringify(obj));
                            res.write(message);
                            res.end();
                        }
                    });
                }

            }

        });

    }


}

exports.execute = execute;


