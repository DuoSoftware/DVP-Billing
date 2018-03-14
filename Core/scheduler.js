/**
 * Created by Kalana on 11/18/2016.
 */

var schedule = require("node-schedule");
var format = require("stringformat");
var config = require('config');
var restify = require('restify');
var validator = require('validator');
var request = require('request');
var async = require('async');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var token = format("Bearer {0}",config.Services.accessToken);
var PublishToQueue = require('../Control/Worker').PublishToQueue;
var DBconn = require('../Control/DbHandler');
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var msg = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var tokenGenerator = require('../Core/tokenGenerator');
var redisTokenValidation = require('./../Control/billingSessionValidator')

var calls = [];
var bills = [];
var tenantBilled = true;


function billing(){

    logger.info('billing is started...');
    /*DONE : 1 .Get clients by batch
     *        2. Get amount due for the client by package service
     *        3. Call wallet service to see if client can pay
     *        4. if paid, Generate Invoice and email.  || else call recurrenceSchedulePayment
     *        5. Save billing history to database
     *
     */


    /*DONE
     *       Tenannt wise billing : 1 tenant has multiple Organization, those organizations should be
     *       billed seperately and added in to one bill,
     *       this should not contain wallet methods or account disabling methods
     */


    redisTokenValidation.get('TENANT_BILLED_STATUS',function(err, status){

        var billing;
        console.log('Billed For month :'+status);
        if(status == 'false'|| status == false){
            bill(1);
            billing = schedule.scheduleJob('1 0 '+config.Host.billingDate +' 1-12 *', function(){
            //billing = schedule.scheduleJob('30 24 11 31 1-12 *', function(){
                console.log('billing is running...');
                bill(1);
            });
        }
        else if(status == 'true' || status== true){
            billing = schedule.scheduleJob('1 0 '+config.Host.billingDate +' 1-12 *', function(){
                //var billing = schedule.scheduleJob('0 3 8 7 1-12 *', function(){
                console.log('billing is running...');
                bill(1);
            });
        }
        else if (status == null){
            billing = schedule.scheduleJob('1 0 '+config.Host.billingDate +' 1-12 *', function(){
            //billing = schedule.scheduleJob('10 18 11 31 1-12 *', function(){
                console.log('billing is running...');
                bill(1);
            });
        }
        else if (err){
            console.log('Redis Error...');
            billing = schedule.scheduleJob('1 0 '+config.Host.billingDate +' 1-12 *', function(){
                //var billing = schedule.scheduleJob('0 3 8 7 1-12 *', function(){
                console.log('billing is running...');
                bill(1);
            });
        }


    });



}


function bill(count){

    redisTokenValidation.save('TENANT_BILLED_STATUS', false, function(){});
    var company ='0';
    var tenant = '1';


    var usertURL = format("http://{0}/DVP/API/{1}/Organisations/", config.Services.userServiceHost, config.Services.userServiceVersion);
    if (validator.isIP(config.Services.userServiceHost))
        usertURL = format("http://{0}:{1}/DVP/API/{2}/Organisations/", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);


    var batchLength = 0;
    var i;


    if(count!=0){
        i = count;
    }
    else{
        i = 0;
    }


    console.log('Getting '+i+'/'+50);
    request({
        method: "GET",
        url: usertURL+i+'/'+50,
        headers: {
            authorization: token,
            companyinfo: format("{0}:{1}", tenant, company)
        },
        json: {}
    }, function (_error, _response, datax) {

        batchLength= (datax.Result).length;
        //console.log('This is batch length :  '+batchLength);


        if ((datax.Result).length != 0)
        {

            var funArray = [];

            for (var index in datax.Result) {
                //console.log(index)
                funArray.push(billEach(datax.Result[index]).invoke);
            }

            async.parallel(funArray,
                function(err, results) {

                    console.log('COMPLETED BATCH :'+i);
                    if(err!=null){
                        console.log('ERROR')
                    }
                    else if((datax.Result).length!=50){

                        console.log('DONE');

                        if(config.Host.tenantBilling){
                            bills = bills.concat(results);
                            console.log(bills.length);

                            var formattedBills = [];

                            for(var index in bills){
                                if(bills.hasOwnProperty(index))
                                    if(bills[index]!=null && bills[index].hasOwnProperty("Parameters")){

                                        for(var j in (bills[index].Parameters.billinginfo)){
                                            var obj = {};
                                            obj.Company = bills[index].Parameters.company;


                                            var formatteddate = bills[index].Parameters.billinginfo[j].date,
                                                delimiter = 'T',
                                                start = 0,
                                                tokens = formatteddate.split(delimiter).slice(start),
                                                day = tokens[0];

                                            obj.Date = day;
                                            obj.Package = bills[index].Parameters.billinginfo[j].name;
                                            obj.Amount = bills[index].Parameters.billinginfo[j].price;
                                            formattedBills.push(obj);
                                            //console.log(formattedBills);

                                        }



                                    }
                                if(index == bills.length -1){


                                    var superUserUrl = format("http://{0}/DVP/API/{1}/Tenant/Monitoring/superUsers", config.Services.userServiceHost, config.Services.userServiceVersion);
                                    if (validator.isIP(config.Services.userServiceHost))
                                        usertURL = format("http://{0}:{1}/DVP/API/{2}/Tenant/Monitoring/superUsers", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);

                                    request({
                                        method: "GET",
                                        url: superUserUrl,
                                        headers: {
                                            authorization: token,
                                            companyinfo: format("{0}:{1}", 1, 103)
                                        },
                                        json: {}
                                    }, function (_error, _response, datax) {


                                        var superUserEmailArray = config.Host.emailUserArray;
                                        var superUserslist= datax.Result;
                                        for(var l in superUserslist){
                                            superUserEmailArray.push(superUserslist[l].email.contact);
                                            /*if( l == superUserEmailArray.length -1 ){
                                                superUserEmailArray.push('kalana@duosoftware.com');
                                                superUserEmailArray.push('champaka@duosoftware.com');
                                                superUserEmailArray.push('chandana@duosoftware.com');
                                                superUserEmailArray.push('sukitha@duosoftware.com');
                                            }*/
                                        }

                                        console.log("Super Users for tenant are \n"+superUserEmailArray);

                                        var sendObj = {
                                            "to" : superUserEmailArray,
                                            //"to" : "kalana@duosoftware.com",
                                            //"to" : "vmkdemel@gmail.com",
                                            "company": 0,
                                            "tenant": 1,
                                            "from" : "Billing",
                                            "subject" : "Billing",
                                            "template" : "Tenant Billing"
                                        };

                                        var date = new Date();
                                        var day = date.getDay(),
                                            month = date.getMonth(),
                                            year = date.getFullYear();

                                        date = day + '-' + month + '-' + year;

                                        var total = 0;

                                        for ( var r in formattedBills){
                                            total = total + formattedBills[r].Amount;
                                        }


                                        tokenGenerator.generateToken(null, function(found){
                                            sendObj.Parameters =
                                            {
                                                "TenantName": 1,
                                                "BillingDate": date,
                                                "PurchaseDetails": formattedBills,
                                                "Total": total.toFixed(2),
                                                "BillToken" :found
                                            };

                                            //console.log("Sending to mail queue...");
                                            //console.log(sendObj);

                                            //PublishToQueue("EMAILOUT", sendObj);

                                            oneTimeMail(sendObj);
                                            redisTokenValidation.save('TENANT_BILLED_STATUS', true, function(){});

                                            bills = [];
                                            tenantBilled = false;

                                            console.log(sendObj);
                                            recurrenceSchedulePaymentTenant(sendObj);
                                        })


                                    });


                                }
                            }
                        }
                    }
                    else{
                        console.log('Starting Batch '+(i+1));

                        if(config.Host.tenantBilling){
                            //console.log(results);
                            bills = bills.concat(results);
                        }
                        bill(i+1);
                    }

                });



        }




    });

}

function billEach(datax){



    return {
        invoke : function (callback){

            //DONE :
            // : all results should be sent as array to the next step
            // : Disable all wallet ralated activities
            // : Do not Disable account
            // : Do not reschedule
            // : Organization Bill Need All tenant details, One email for the entire Organization
            // : Send to SuperUser Email

            if(config.Host.userBilling == true || config.Host.userBilling== "true" ){

                //console.log('Executing User Billing ')

                async.waterfall([
                    function (callback) {

                        //Get Company ID
                        //console.log(datax);
                        callback(null, datax.id);
                    },
                    function (userid, callback) {

                        var relCompany = datax.id;
                        var relTenant = datax.tenant;
                        var email = datax.ownerId;

                        var usertURL = format("http://{0}/DVP/API/{1}/Organisation/billingInformation", config.Services.userServiceHost, config.Services.userServiceVersion);
                        if (validator.isIP(config.Services.userServiceHost)) {
                            usertURL = format("http://{0}:{1}/DVP/API/{2}/Organisation/billingInformation", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);
                            //usertURL = format("http://192.168.5.175:{1}/DVP/API/{2}/Organisation/billingInformation", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);
                        }
                        request({
                            method: "GET",
                            url: usertURL,
                            headers: {
                                Authorization: token,
                                companyinfo: format("{0}:{1}", relTenant, relCompany)
                            },
                            json: {}
                        }, function (_error, _response, datax) {

                            if(datax && (datax.Result).length != 0){
                                var user_packages = datax.Result;

                                var amount = 0;
                                for (var individualAmount in user_packages) {
                                    if (!user_packages[individualAmount].isTrial) {
                                        amount = amount + (user_packages[individualAmount].unitPrice * user_packages[individualAmount].units);
                                    }
                                    if (individualAmount == user_packages.length - 1) {
                                        //console.log(userid+' '+amount);
                                        callback(null, userid, amount, datax.Result, email);
                                    }
                                }
                            }
                            else if(datax){
                                callback(null, userid, 0, datax.Result, email);
                                //console.log('No Packages available')
                            }
                            else if(_error){
                                console.log(_error)
                            }
                            else{
                                callback(null, userid, 0, [], email);
                                //console.log('Package Service issue')
                            }



                        });


                    },
                    function (userid, amount, packageDetails, email, callback) {
                        var relCompany = datax.id;
                        var relTenant = datax.tenant;



                        var formattedPackgeDetatils = [];

                        if(packageDetails.length!=0)
                            for(var index in formattedPackgeDetatils){

                                var obj = {};
                                obj.name = packageDetails[index].name;
                                obj.type = packageDetails[index].type;
                                obj.category = packageDetails[index].category;
                                obj.unitPrice = packageDetails[index].unitPrice;
                                obj.units = packageDetails[index].units;
                                obj.price = packageDetails[index].units * packageDetails[index].unitPrice;

                                formattedPackgeDetatils.push(obj);

                            }

                        //console.log(formattedPackgeDetatils);
                        // call wallet deduction with amount
                        var walletURL = format("http://{0}/DVP/API/{1}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServiceVersion);


                        if (validator.isIP(config.Services.walletServiceHost)) {
                            walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);
                            //walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", 'localhost', "3333", config.Services.walletServiceVersion);

                        }
                        //walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);


                        request({
                            method: "PUT",
                            url: walletURL,
                            headers: {
                                Authorization: token,
                                companyinfo: format("{0}:{1}", relTenant , relCompany)
                            },
                            json: {"Amount": amount, "Reason": "Billing for the month"}
                        }, function (_error, _response, datax) {
                            //console.log(email);
                            if (datax && datax.IsSuccess) {



                                var date = new Date();
                                var month  = date.getMonth();

                                //Save to Database
                                var customer = {};
                                customer.customer = relCompany.toString();
                                customer.email = email;
                                customer.status = true;
                                customer.subscriptions = JSON.stringify(formattedPackgeDetatils);
                                customer.tenant = parseInt(relTenant);
                                customer.company = parseInt(relCompany);
                                customer.cycle = month.toString();
                                customer.data = [];
                                var obj = {};
                                obj[month] = formattedPackgeDetatils;
                                customer.data.push(obj);



                                DBconn.CustomerCycleById(customer, function(err,obj){

                                    if(err){
                                        console.log(err);


                                    }
                                    else {

                                        if(!JSON.parse(obj).IsSuccess){
                                            console.log('New Record Created');
                                            DBconn.CreateCustomerBillRecord(customer, function(err,obj){
                                                if(err){

                                                    var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", true, customer);
                                                    //res.end(jsonString);
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
                                                            billinginfo:formattedPackgeDetatils
                                                        };
                                                        //sendObj.attachments = [{name:name, url:url}]

                                                        PublishToQueue("EMAILOUT", sendObj);


                                                    }


                                                    //var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, obj);
                                                    //res.end(jsonString);
                                                }
                                            });
                                        }
                                        else if(parseInt(JSON.parse(obj).Result.Cycle) > month){
                                            console.log('Old Record Updated');
                                            var object = JSON.parse(obj);
                                            if(object.Result.OtherJsonData !=null){
                                                var actualJson = object.Result.OtherJsonData;
                                                var obj = {};
                                                obj[month] = formattedPackgeDetatils;
                                                actualJson.push(obj);
                                                customer.data = actualJson;
                                            }
                                            else{
                                                var obj = {};
                                                obj[month] = formattedPackgeDetatils;
                                                customer.data = obj;
                                            }


                                            DBconn.UpdateCustomerBillRecord(customer, function(err,obj){
                                                if(err){
                                                    var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, customer);
                                                    //res.end(jsonString);
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
                                                            billinginfo:formattedPackgeDetatils
                                                        };
                                                        //sendObj.attachments = [{name:name, url:url}]

                                                        PublishToQueue("EMAILOUT", sendObj);


                                                    }
                                                    console.log('Billing Successful');
                                                    var message = msg.FormatMessage(undefined, "Package bought", true, obj);
                                                    logger.info('[BUY PACKAGE]:SUCCESS - %s ', JSON.stringify(obj));
                                                    //res.write(message);
                                                    //res.end();
                                                }
                                            });
                                        }
                                        else{
                                            console.log('Already Billed');
                                        }

                                    }

                                });
                                callback(null, datax);

                            }
                            else {
                                //console.log('Billing Unsuccessful, rescheduling billing');
                                var data= {};
                                data.count = 0;
                                data.company = relCompany;
                                data.tenant = relTenant;
                                data.amount = amount;
                                data.email = email;
                                data.formattedPackgeDetatils = formattedPackgeDetatils;
                                //console.log(data);
                                recurrenceSchedulePayment(data);
                                callback(null, datax);
                            }


                        });


                    }
                ], function (err, result) {
                    if(err==null){

                        //console.log('Cycle Complete');

                    }
                    callback(null);

                });

            }
            if(config.Host.tenantBilling){
                //console.log("Executing tenant billing")
                async.waterfall([
                    function (callback) {

                        //Get Company ID
                        //console.log(datax);
                        callback(null, datax.id);
                    },
                    function (userid, callback) {

                        var relCompany = datax.id;
                        var relTenant = datax.tenant;
                        var email = datax.ownerId;

                        var usertURL = format("http://{0}/DVP/API/{1}/Organisation/billingInformation", config.Services.userServiceHost, config.Services.userServiceVersion);
                        if (validator.isIP(config.Services.userServiceHost)) {
                            usertURL = format("http://{0}:{1}/DVP/API/{2}/Organisation/billingInformation", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);
                            //usertURL = format("http://192.168.5.175:{1}/DVP/API/{2}/Organisation/billingInformation", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);
                        }
                        request({
                            method: "GET",
                            url: usertURL,
                            headers: {
                                Authorization: token,
                                companyinfo: format("{0}:{1}", relTenant, relCompany)
                            },
                            json: {}
                        }, function (_error, _response, datax) {

                            if(datax && (datax.Result).length != 0){
                                var user_packages = datax.Result;

                                var amount = 0;
                                for (var individualAmount in user_packages) {
                                    if (!user_packages[individualAmount].isTrial) {
                                        amount = amount + (user_packages[individualAmount].unitPrice * user_packages[individualAmount].units);
                                    }
                                    if (individualAmount == user_packages.length - 1) {
                                        //console.log(userid+' '+amount);
                                        callback(null, userid, amount, datax.Result, email);
                                    }
                                }
                            }
                            else if(datax){
                                callback(null, userid, 0, datax.Result, email);
                                //console.log('No Packages available')
                            }
                            else if(_error){
                                console.log(_error)
                            }
                            else{
                                callback(null, userid, 0, [], email);
                                //console.log('Package Service issue')
                            }



                        });


                    },
                    function (userid, amount, packageDetails, email, callback) {
                        var relCompany = datax.id;
                        var relTenant = datax.tenant;

                        var formattedPackgeDetatils = [];

                        if(packageDetails.length!=0){
                            for(var index in packageDetails){
                                var obj = {};
                                obj.name = packageDetails[index].name;
                                obj.type = packageDetails[index].type;
                                obj.category = packageDetails[index].category;
                                obj.unitPrice = packageDetails[index].unitPrice;
                                obj.units = packageDetails[index].units;
                                obj.date =  packageDetails[index].date;
                                obj.price = packageDetails[index].units * packageDetails[index].unitPrice;

                                formattedPackgeDetatils.push(obj);
                            }


                        }




                        var date = new Date();
                        var month  = date.getMonth();

                        //Save to Database
                        var customer = {};
                        customer.customer = relCompany.toString();
                        customer.email = email;
                        customer.status = true;
                        customer.subscriptions = JSON.stringify(formattedPackgeDetatils);
                        customer.tenant = parseInt(relTenant);
                        customer.company = parseInt(relCompany);
                        customer.cycle = month.toString();
                        customer.data = [];
                        customer.data = [];
                        var pushobj = {};
                        pushobj[month] = formattedPackgeDetatils;
                        customer.data.push(pushobj);
                        //console.log('This is formatted package: '+JSON.stringify(formattedPackgeDetatils));

                        DBconn.CustomerCycleById(customer, function(err,obj){
                            //console.log('This is formatted customer package: '+JSON.stringify(pushobj[month]));

                            if(err){
                                console.log(err);

                            }
                            else {

                                if(!JSON.parse(obj).IsSuccess){
                                    console.log('New Record Created');
                                    DBconn.CreateCustomerBillRecord(customer, function(err,object){
                                        if(err){

                                            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", true, customer);
                                            callback(null, null);
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




                                                //console.log(packageDetails);

                                                sendObj.to =  email;
                                                //sendObj.to =  "kalana@duosoftware.com";
                                                sendObj.from = "Billing";
                                                sendObj.subject = "Billing";
                                                sendObj.template = "Billing Information";
                                                sendObj.Parameters =
                                                {
                                                    username:email,
                                                    totalbill:amount.toFixed(2),
                                                    id:relTenant+"."+relCompany+"."+month+"."+year,
                                                    created_at:date,
                                                    company : relCompany,
                                                    owner : '',
                                                    mail : email,
                                                    billinginfo:pushobj[month]
                                                };
                                                //sendObj.attachments = [{name:name, url:url}]
                                                callback(null, sendObj);
                                                //PublishToQueue("EMAILOUT", sendObj);
                                                //bill.push({"tenant":relTenant,"body":sendObj});


                                            }
                                            else{
                                                callback(null, null);
                                            }


                                            //var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, obj);
                                            //res.end(jsonString);
                                        }
                                    });

                                    //callback(null, datax);
                                }
                                else if(parseInt(JSON.parse(obj).Result.Cycle) < month){

                                    console.log('First Billing: '+JSON.parse(obj).Result.FirstBilling+' Package length :'+packageDetails.length);

                                    if(JSON.parse(obj).Result.FirstBilling){
                                        var formattedPackgeDetatils = [];
                                        if(packageDetails.length!=0){

                                            var date = JSON.parse(obj).Result.BuyDate;
                                            //date= date.toDateString;
                                            //Get date out of the string


                                            if(date == null){
                                                date = new Date();
                                                date = date.toString();
                                            }
                                            var str = date,
                                                delimiter = ' ',
                                                start = 2,
                                                tokens = str.split(delimiter).slice(start),
                                                day = tokens[0];

                                            console.log('Bought Day is : '+ day);

                                            if(day ==31 || day == 30){
                                                day == 29
                                            }



                                            for(var k in packageDetails){
                                                var newObj = {};
                                                newObj.name = packageDetails[k].name;
                                                newObj.type = packageDetails[k].type;
                                                newObj.category = packageDetails[k].category;
                                                newObj.unitPrice = packageDetails[k].unitPrice;
                                                newObj.date =  packageDetails[index].date;
                                                newObj.units = packageDetails[k].units;
                                                newObj.price = ((packageDetails[k].units * packageDetails[k].unitPrice) * (30-day)).toFixed(2);

                                                formattedPackgeDetatils.push(newObj);
                                            }


                                            console.log('First Billing... amount : '+ newObj.price);
                                            console.log(newObj)

                                        }
                                    }

                                    console.log('Old Record Updated '+JSON.parse(obj).Result.Cycle +' '+month);
                                    var object = JSON.parse(obj);
                                    if(object.Result.OtherJsonData !=null){
                                        var actualJson = object.Result.OtherJsonData;
                                        var obj = {};
                                        obj[month] = formattedPackgeDetatils;
                                        actualJson.push(obj);
                                        customer.data = actualJson;
                                    }
                                    else{
                                        var obj = {};
                                        obj[month] = formattedPackgeDetatils;
                                        customer.data = obj;
                                    }

                                    DBconn.UpdateCustomerBillRecord(customer, function(err,obj){
                                        if(err){
                                            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, customer);
                                            callback(null, null);
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
                                                    totalbill:amount.toFixed(2),
                                                    id:relTenant+"."+relCompany+"."+month+"."+year,
                                                    created_at:date,
                                                    company : '',
                                                    owner : '',
                                                    mail : email,
                                                    billinginfo:pushobj[month]
                                                };
                                                //sendObj.attachments = [{name:name, url:url}]

                                                //PublishToQueue("EMAILOUT", sendObj);

                                            }
                                            console.log('Billing Successful');
                                            var message = msg.FormatMessage(undefined, "Package bought", true, obj);

                                            callback(null, sendObj);
                                        }
                                    });
                                }
                                else{
                                    console.log('Already Billed');
                                    callback(null, null);

                                }

                            }

                        });


                    }
                ], function (err, result) {
                    if(err==null){
                        //console.log('Cycle Complete');
                    }
                    callback(null,result);

                });
            }

        }
    }

}


function oneTimeMail(data){

    console.log('Executing one time rule');
    var oneTimeRule = new schedule.RecurrenceRule();
    oneTimeRule.second = 1;


    var oneTimeTask = schedule.scheduleJob(oneTimeRule, function(){
        PublishToQueue("EMAILOUT", data);
        oneTimeTask.cancel();
    });


}

function recurrenceSchedulePaymentTenant(data){

    var relCompany = 0;
    var relTenant = 1;
    var amount = data.amount;
    logger.info('[RESCHEDULE]: '+relTenant+':'+'1');
    var rule = new schedule.RecurrenceRule();
    rule.hour = (config.Host.reschedulefreqency*24)/config.Host.rescheduletries;
    //rule.second = 30;
    var count;
    if(data.hasOwnProperty('count')){
        count = data.count;
    }
    else{
        count = 0;
    }



    var task = schedule.scheduleJob(rule, function(){


        //console.log(count);
        if(count<config.Host.rescheduletries){

            if(!tenantBilled){

                logger.info('[RESCHEDULE] Payment failed, rescheduling for ' + relCompany + ':' + relTenant + ' attempt :' + count);

                //data.count=data.count+1;
                count++;

                //send warning

                //Send Invoice
                var sendObj = {
                    "company": 0,
                    "tenant": 1
                };

                //Send Email starting on a specific day if no ballance in wallet
                if (amount != 0 && count>=config.Host.EmailWarningActDay ) {
                    data.subject = "DEACTIVATION WARNING :Days left "+ (count -config.Host.rescheduletries );
                    PublishToQueue("EMAILOUT", data);
                }

            }
            else{
                console.log('TenantBilled...');
                task.cancel();
            }


        }
        else{

            if(!tenantBilled){
                var key = "1_BILL_TOKEN";
                redisTokenValidation.del(key);
                /*var key2 = config.Host.TenantName + "_BILL_HASH_TOKEN";
                redisTokenValidation.del(key2);*/
                logger.info('[DEACTIVATION] Disabling account for :'+relTenant+':'+relCompany);
                setBilled(false);
                task.cancel();
            }
            else{
                console.log('TenantBilled...');
                task.cancel();
            }



        }

    });

}

//Make 24 hour recurring requests to pay the bill till a designated time limit and the disable account
function recurrenceSchedulePayment(data){

    var relCompany = data.company;
    var relTenant = data.tenant;
    var amount = data.amount;
    logger.info('[RESCHEDULE]: '+relTenant+':'+relCompany);
    var rule = new schedule.RecurrenceRule();
    rule.hour = (config.Host.reschedulefreqency*24)/config.Host.rescheduletries;
    //rule.second = 1;
    var count;
    if(data.hasOwnProperty('count')){
        count = data.count;
    }
    else{
        count = 0;
    }


    if(config.Host.userBilling){
        var task = schedule.scheduleJob(rule, function(){


            //console.log(count);
            if(count<config.Host.rescheduletries){
                //Call Wallet to retry
                // call wallet deduction with amount
                var walletURL = format("http://{0}/DVP/API/{1}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServiceVersion);


                if (validator.isIP(config.Services.walletServiceHost)) {
                    walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);
                    //walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", 'localhost', "3333", config.Services.walletServiceVersion);

                }
                //walletURL = format("http://{0}:{1}/DVP/API/{2}/PaymentManager/Customer/Wallet/Credit", config.Services.walletServiceHost, config.Services.walletServicePort, config.Services.walletServiceVersion);


                request({
                    method: "PUT",
                    url: walletURL,
                    headers: {
                        Authorization: token,
                        companyinfo: format("{0}:{1}", relTenant, relCompany)
                    },
                    json: {"Amount":amount, "Reason": "Billing for the month"}
                }, function (_error, _response, datax) {
                    //console.log(datax);
                    if(datax.IsSuccess){
                        task.cancel();
                        callback(null, datax);
                    }
                    else {

                        logger.info('[RESCHEDULE] Payment failed, rescheduling for ' + relCompany + ':' + relTenant + ' attempt :' + count);

                        //data.count=data.count+1;
                        count++;

                        //send warning

                        //Send Invoice
                        var sendObj = {
                            "company": 0,
                            "tenant": 1
                        };

                        var date = new Date();
                        var month = date.getMonth();

                        //Send Email starting on a specific day if no ballance in wallet
                        if (amount != 0 && count>=config.Host.EmailWarningActDay ) {
                            sendObj.to = data.email;
                            //sendObj.to =  "kalana@duosoftware.com";
                            sendObj.from = "Billing";
                            sendObj.template = "Billing Information";
                            sendObj.Parameters =
                            {
                                username: data.email,
                                totalbill: amount,
                                id: relTenant + "." + relCompany + "." + month,
                                created_at: date,
                                company: data.email,
                                owner: data.email,
                                mail: data.email,
                                billinginfo: data.formattedPackgeDetatils
                            };
                            //sendObj.attachments = [{name:name, url:url}]

                            PublishToQueue("EMAILOUT", sendObj);

                        }
                    }


                });


            }
            else{
                //Call User service to disable account
                //Stop Recurrence

                // call wallet deduction with amount
                var userURL = format("http://{0}/DVP/API/{1}/Organisation/Activate/false", config.Services.userServiceHost, config.Services.userServiceVersion);


                if (validator.isIP(config.Services.userServiceHost)) {
                    userURL = format("http://{0}:{1}/DVP/API/{2}/Organisation/Activate/false", config.Services.userServiceHost, config.Services.userServicePort, config.Services.userServiceVersion);
                    //walletURL = format("http://{0}:{1}/DVP/API/{2}/Organisation/Activate/false", 'localhost', "3333", config.Services.walletServiceVersion);

                }

                if(amount!=0){
                    request({
                        method: "PUT",
                        url: userURL,
                        headers: {
                            Authorization: token,
                            companyinfo: format("{0}:{1}", "1", "594")
                        },
                        json: {"Amount":amount}
                    }, function (_error, _response, datax) {
                        //console.log(datax);
                        if(datax && datax.IsSuccess){

                            logger.info('[DEACTIVATION] Disabling account for :'+relTenant+':'+relCompany);
                            task.cancel();

                        }
                        else{
                            //if Request fails, reschedule
                            //data.count=data.count+1;

                        }


                    });
                }


            }

        });
    }





}




function setBilled(val){
    tenantBilled = val;
    console.log('Tenant Billing set to: '+tenantBilled);
}

exports.setBilled = setBilled;
exports.bill = billing;
