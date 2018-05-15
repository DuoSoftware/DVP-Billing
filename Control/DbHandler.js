/**
 * Created by Rajinda on 10/1/2015.
 */

var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var DbConn = require('dvp-dbmodels');
var Sequelize = require('sequelize');
var util = require('util');


/*-------------- Channel Master Data --------------------*/
module.exports.CreateCustomerBillRecord = function (customer, callback) {
    var datetime = new Date();

    if(customer.data && util.isObject(customer))
    {
        var dataString = JSON.stringify(customer.data);
        customer.data=dataString;


    }

    DbConn.CustomerBillRecord
        .create(
            {
                email: customer.email,
                subscriptions: customer.subscriptions,
                Cycle: customer.cycle,
                customer: customer.customer,
                TenantId: customer.tenant,
                CompanyId: customer.company,
                Status:customer.Status,
                OtherJsonData:customer.data,
                FirstBilling : customer.firstbilling,
                BuyDate : customer.buydate,
                createdAt: datetime,
                updatedAt:datetime
            }
        ).then(function (cmp) {
        callback(undefined, cmp);
    }).error(function (err) {
        callback(err, undefined);
    });
};


module.exports.UpdateCustomerBillRecord = function (customer, callback) {
    var datetime = new Date();
    if(!customer.firstbilling){
        customer.firstbilling = null;
    }

    if(customer.data && util.isObject(customer))
    {
        var dataString = JSON.stringify(customer.data);
        customer.data=dataString;


    }

    DbConn.CustomerBillRecord
        .update(
            {
                Cycle: customer.cycle,
                updatedAt:datetime,
                OtherJsonData:customer.data,
                FirstBilling  : customer.firstbilling,
                BuyDate : customer.buydate

            }
            ,
            {
                where: [{customer: customer.customer}, {TenantId: customer.tenant}, {CompanyId: customer.company}]
            }
        ).then(function (cmp) {
        callback(undefined, cmp);
    }).error(function (err) {
        callback(err, undefined);
    });
};

/*module.exports.UpdateCustomerBillToken = function (customer, callback) {
 var datetime = new Date();

 DbConn.CustomerBillRecord
 .update(
 {
 BillToken: customer.billToken,
 updatedAt:datetime,
 Status:customer.status

 }
 ,
 {
 where: [{TenantId: customer.tenant}, {CompanyId: customer.company}]
 }
 ).then(function (cmp) {
 var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
 logger.info('[CustomerUpdateBillToken] -  Billing - [%s] .', jsonString);
 callback(null, jsonString);
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, err);
 logger.info('[CustomerUpdateBillToken] -  Billing - [%s] .', jsonString);
 callback(err, jsonString);
 });
 };*/

module.exports.CustomerCycleById = function (customer, res) {
    var datetime = new Date();
    DbConn.CustomerBillRecord
        .find({
            where: [{customer:  customer.customer}, {TenantId: customer.tenant}, {CompanyId: customer.company}]
        }).then(function (CustomerBillRecord) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, 0);
        if (CustomerBillRecord) {

            if(CustomerBillRecord.OtherJsonData)
            {
                var jObj = JSON.parse(CustomerBillRecord.OtherJsonData);
                CustomerBillRecord.OtherJsonData=jObj;
            }

            var data = {
                "CompanyId": CustomerBillRecord.CompanyId,
                "Cycle": CustomerBillRecord.Cycle,
                "FirstBilling" : CustomerBillRecord.FirstBilling,
                "BuyDate" : CustomerBillRecord.BuyDate,
                "OtherJsonData" : CustomerBillRecord.OtherJsonData
            };

            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, data);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", false, 0);
        }

        //logger.info('[CustomerCycleById] -  Billing - [%s] .', jsonString);
        res(null,jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        //logger.error('[CustomerCycleById] - [%s] ', jsonString);
        res(err,jsonString);
    });
};

/*-------------- Channel Master Data --------------------*/
module.exports.CreateRatingRecord = function (provider, data, callback) {
    //console.log(provider)

    if(data && util.isObject(data))
    {
        var dataString = JSON.stringify(data);
        data=dataString;
    }

    DbConn.CallRatings
        .upsert(
            {
                Provider : provider,
                PaymentData : data
            }
        ).then(function (cmp) {
        callback(undefined, cmp);
    }).error(function (err) {
        callback(err, undefined);
    });
};

module.exports.getRatingRecords = function (res) {
    DbConn.CallRatings
        .findAll({}).then(function (CallRatings) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, 0);
        if (CallRatings) {



            var data = CallRatings.map(function (item) {

                if(item.PaymentData)
                {
                    var paymentObj = JSON.parse(item.PaymentData);
                    item.PaymentData=paymentObj;
                }
                return item;
            });


            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, data);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", false, 0);
        }
        res(null,jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);

        res(err,jsonString);
    });
};

