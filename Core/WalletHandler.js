/**
 * Created by Rajinda on 11/15/2016.
 */

var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var logger = require('dvp-common/LogHandler/CommonLogHandler.js').logger;
var DbConn = require('dvp-dbmodels');
var redis = require('ioredis');
var config = require('config');
var Q = require('q');
var Redlock = require('redlock');

var ttl = config.Redis.ttl;

var redisip = config.Redis.ip;
var redisport = config.Redis.port;
var redispass = config.Redis.password;
var redismode = config.Redis.mode;
var redisdb = config.Redis.db;

var redisSetting =  {
    port:redisport,
    host:redisip,
    family: 4,
    password: redispass,
    db: redisdb,
    retryStrategy: function (times) {
        var delay = Math.min(times * 50, 2000);
        return delay;
    },
    reconnectOnError: function (err) {

        return true;
    }
};


if(redismode == 'sentinel'){

    if(config.Redis.sentinels && config.Redis.sentinels.hosts && config.Redis.sentinels.port && config.Redis.sentinels.name){
        var sentinelHosts = config.Redis.sentinels.hosts.split(',');
        if(Array.isArray(sentinelHosts) && sentinelHosts.length > 2){
            var sentinelConnections = [];

            sentinelHosts.forEach(function(item){

                sentinelConnections.push({host: item, port:config.Redis.sentinels.port})

            });

            redisSetting = {
                sentinels:sentinelConnections,
                name: config.Redis.sentinels.name,
                password: redispass,
                db: redisdb
            }

        }else{

            console.log("No enough sentinel servers found .........");
        }

    }
}

var client = undefined;

if(redismode != "cluster") {
    client = new redis(redisSetting);
}else{

    var redisHosts = redisip.split(",");
    if(Array.isArray(redisHosts)){


        redisSetting = [];
        redisHosts.forEach(function(item){
            redisSetting.push({
                host: item,
                port: redisport,
                family: 4,
                password: redispass,
                db: redisdb});
        });

        client = new redis.Cluster([redisSetting]);

    }else{

        client = new redis(redisSetting);
    }


}



var redlock = new Redlock(
    [client],
    {
        driftFactor: 0.01,

        retryCount:  10000,

        retryDelay:  200

    }
);

var buyCredit = function (walletId, amount, user) {

    var deferred = Q.defer();

    if (walletId) {
        redlock.lock('lock:'+walletId, ttl, function (done) {
            console.log("Lock acquired" + walletId);

            DbConn.Wallet.find({
                where: [{WalletId: walletId}, {Owner: user.iss}, {TenantId: user.tenant}, {CompanyId: user.company}, {Status: true}]
            }).then(function (wallet) {
                if (wallet) {
                    amount = parseFloat(amount);
                    // buy credit form strip
                    directPayment.BuyCredit(wallet, amount).then(function (charge) {
                        var credit = parseFloat(wallet.Credit) + amount;
                        DbConn.Wallet
                            .update(
                                {
                                    Credit: credit
                                },
                                {
                                    where: [{WalletId: wallet.WalletId}]
                                }
                            ).then(function (cmp) {
                            done();
                            if (cmp[0] === 1) {
                                deferred.resolve(credit);
                            }
                            else {
                                deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                            }
                            var data = {
                                StripeId: undefined,
                                Description: "Buy Credit using Credit Card",
                                CurrencyISO: wallet.CurrencyISO,
                                Credit: credit,
                                Tag: undefined,
                                TenantId: user.tenant,
                                CompanyId: user.company,
                                OtherJsonData: {
                                    "amount": amount,
                                    "Balance": credit,
                                    "msg": "BuyCredit",
                                    "invokeBy": user.iss
                                },
                                WalletId: cmp.WalletId,
                                Operation: 'BuyCredit',
                                InvokeBy: user.iss,
                                Reason: "Buy Credit using Credit Card"
                            };
                            addHistory(data);
                        }).error(function (err) {
                            done();
                            deferred.reject(err);
                        });

                    }, function (error) {
                        done();
                        deferred.reject(error);
                    });
                }
                else {
                    done();
                    deferred.reject(new Error("Invalid Wallet ID"));
                }
            }).error(function (err) {
                done();
                deferred.reject(err);
            });
        });

    }
    else {
        deferred.reject(new Error("Invalid Wallet ID"));
    }
    return deferred.promise;
};

var deductCredit = function (req, wallet, credit, amount) {

    var deferred = Q.defer();

    redlock.lock('lock:'+wallet.WalletId, ttl, function (done) {
        if (wallet) {
            if (credit > amount) {
                credit = credit - amount;
                DbConn.Wallet
                    .update(
                        {
                            Credit: credit
                        },
                        {
                            where: [{WalletId: wallet.WalletId}]
                        }
                    ).then(function (cmp) {
                    done();
                    if (cmp[0] === 1) {
                        deferred.resolve(credit);
                    }
                    else {
                        deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                    }
                    var data = {
                        StripeId: undefined,
                        Description: req.body.Reason,
                        CurrencyISO: undefined,
                        Credit: credit,
                        Tag: undefined,
                        TenantId: req.user.tenant,
                        CompanyId: req.user.company,
                        OtherJsonData: {
                            "msg": "DeductCredit",
                            "amount": amount, "Balance": credit,
                            "invokeBy": req.user.iss,
                            "OtherJsonData": req.body.OtherJsonData
                        },
                        WalletId: cmp.WalletId,
                        Operation: 'DeductCredit',
                        InvokeBy: req.user.iss,
                        Reason: req.body.Reason ? req.body.Reason : "Buy Credit using Credit Card"
                    };
                    addHistory(data);
                }).error(function (error) {
                    done();
                    deferred.reject(error);
                });
            }
            else {
                done();
                deferred.reject(new Error("Insufficient  Credit Balance."));
            }
        }
    });

    return deferred.promise;
};

module.exports.CreatePackage = function (req, res) {

    directPayment.DirectPayment(req.body).then(function (customer) {
        DbConn.Wallet
            .create(
                {
                    Owner: req.user.iss,
                    StripeId: customer.id,
                    Description: req.body.Description,
                    Tag: req.body.Tag,
                    CurrencyISO: req.body.CurrencyISO,
                    Credit: req.body.Credit,
                    Status: true,
                    AutoRecharge: req.body.CurrencyISO,
                    AutoRechargeAmount: 0,
                    ThresholdValue: 0,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company
                }
            ).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('CreatePackage - Create Wallet - [%s] .', jsonString);
            req.body.WalletId = cmp.WalletId;
            this.BuyCredit(req.body.Amount, req.body.user);
            var data = {
                StripeId: customer.id,
                Description: req.body.Description,
                CurrencyISO: req.body.CurrencyISO,
                Credit: 0,
                Tag: req.body.Tag,
                TenantId: req.user.tenant,
                CompanyId: req.user.company,
                OtherJsonData: {"msg": "Create New Wallet", "invokeBy": req.user.iss},
                WalletId: cmp.WalletId,
                Operation: 'CreatePackage',
                InvokeBy: req.user.iss,
                Reason: "Create Package"
            };
            addHistory(data);
        }).error(function (err) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('CreatePackage - Fail To Create Wallet. - [%s] .', jsonString);
            res.end(jsonString);
        });

    }, function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('CreatePackage-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });

};

module.exports.CreateWallet = function (req, res) {

    directPayment.CustomerRegister(req.headers['api_key'], req.body).then(function (customer) {

        DbConn.Wallet
            .create(
                {
                    Owner: req.user.iss,
                    StripeId: customer.id,
                    Description: req.body.Description,
                    Tag: req.body.Tag,
                    CurrencyISO: req.body.CurrencyISO,
                    Credit: 0,
                    Status: true,
                    AutoRecharge: req.body.AutoRecharge,
                    AutoRechargeAmount: 0,
                    ThresholdValue: 0,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company
                }
            ).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('CreateWallet - Create Wallet - [%s] .', jsonString);
            res.end(jsonString);
            var data = {
                StripeId: customer.id,
                Description: req.body.Description,
                CurrencyISO: req.body.CurrencyISO,
                Credit: 0,
                Tag: req.body.Tag,
                TenantId: req.user.tenant,
                CompanyId: req.user.company,
                OtherJsonData: {"msg": "Create New Wallet", "invokeBy": req.user.iss},
                WalletId: cmp.WalletId,
                Operation: 'CreateWallet',
                InvokeBy: req.user.iss,
                Reason: "Create Wallet"
            };
            addHistory(data);
        }).error(function (err) {
            var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
            logger.error('CreateWallet - Fail To Create Wallet. - [%s] .', jsonString);
            res.end(jsonString);
        });

    }, function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('CreateWallet-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });
};

module.exports.CreateWalletBulk = function (req, res) {

    var jsonString = messageFormatter.FormatMessage(new Error('Not Implemented.'), "EXCEPTION", false, undefined);
    logger.error('CreateWallet-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
    res.end(jsonString);

    /*  var task = [];
     if(req.body.Organisations){
     req.body.Organisations.forEach(function (item) {
     task.push(function createContact(callback) {
     directPayment.CustomerRegister(item).then(function (customer) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, customer);
     callback(jsonString);
     }, function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('CreateWallet-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
     callback(jsonString);
     });
     });
     });
     }
     async.parallel(task, function(err, results) {
     if(err){
     }
     else{
     if(results){
     var items = [];
     results.forEach(function(item){
     var obj = {
     Owner: req.user.iss,
     StripeId: item.id,
     Description: req.body.Description,
     Tag: req.body.Tag,
     CurrencyISO: req.body.CurrencyISO,
     Credit: 0,
     Status: true,
     TenantId: req.user.tenant,
     CompanyId: req.user.company
     };
     items.push(obj);
     });
     if(items.length>0){
     var jsonString;
     DbConn.Wallet.bulkCreate(
     results, {validate: false, individualHooks: true}
     ).then(function (results) {
     jsonString = messageFormatter.FormatMessage(undefined, "SUCCESS", true, results);
     logger.info('CreateWalletBulk - UploadContacts successfully.[%s] ', jsonString);
     res.end(jsonString);
     }).catch(function (err) {
     jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('CreateWalletBulk - failed', err);
     res.end(jsonString);
     }).finally(function () {
     });
     }
     }
     }
     });
     */
};

module.exports.UpdateWallet = function (req, res) {

    DbConn.Wallet
        .update(
            {
                AutoRechargeAmount: req.body.AutoRechargeAmount,
                AutoRecharge: req.body.AutoRecharge,
                ThresholdValue: req.body.ThresholdValue
            },
            {
                where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
            }
        ).then(function (cmp) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
        logger.info('UpdateWallet - Update Wallet - [%s] .', jsonString);
        res.end(jsonString);
        var data = {
            StripeId: "",
            Description: req.body.Description,
            CurrencyISO: "",
            Credit: 0,
            Tag: req.body.Tag,
            TenantId: req.user.tenant,
            CompanyId: req.user.company,
            OtherJsonData: {"Data": req.body, "invokeBy": req.user.iss},
            WalletId: cmp.WalletId,
            Operation: 'UpdateWallet',
            InvokeBy: req.user.iss,
            Reason: "Apply Configurations"
        };
        addHistory(data);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('UpdateWallet - Fail To Update Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });
};

module.exports.BuyCredit = function (req, res) {

    buyCredit(req.params.WalletId, req.body.Amount, req.user).then(function (cmp) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
        logger.info('BuyCredit - Update Wallet - [%s] .', jsonString);
        res.end(jsonString);

    }, function (error) {
        var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
        logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
        res.end(jsonString);
    });
};

/*module.exports.BuyCredit = function (req, res) {
 var walletId = req.params.WalletId;
 if (walletId) {
 lock(walletId, ttl, function (done) {
 console.log("Lock acquired" + walletId);
 // No one else will be able to get a lock on 'myLock' until you call done()  done();
 DbConn.Wallet.find({
 where: [{WalletId: walletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
 }).then(function (wallet) {
 if (wallet) {
 var amount = parseFloat(req.body.Amount);
 // buy credit form strip
 directPayment.BuyCredit(wallet, amount).then(function (charge) {
 var credit = parseFloat(wallet.Credit) + amount;
 DbConn.Wallet
 .update(
 {
 Credit: credit
 },
 {
 where: [{WalletId: wallet.WalletId}]
 }
 ).then(function (cmp) {
 var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", cmp[0] === 1, cmp[0] === 1 ? credit : 0);
 logger.info('BuyCredit - Update Wallet - [%s] .', jsonString);
 done();
 res.end(jsonString);
 var data = {
 StripeId: undefined,
 Description: undefined,
 CurrencyISO: undefined,
 Credit: credit,
 Tag: undefined,
 TenantId: req.user.tenant,
 CompanyId: req.user.company,
 OtherJsonData: {"msg": "BuyCredit", "invokeBy": req.user.iss},
 WalletId: cmp.WalletId
 };
 addHistory(data);
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
 done();
 res.end(jsonString);
 });
 }, function (error) {
 var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
 logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
 done();
 res.end(jsonString);
 });
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
 logger.error('[BuyCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 }
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('[BuyCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 });
 });
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("No Wallet ID"), "EXCEPTION", false, undefined);
 logger.error('[BuyCredit] - [%s] ', jsonString);
 res.end(jsonString);
 }
 };*/

module.exports.BuyCreditFormSelectedCard = function (req, res) {
    /*if (req.params.WalletId) {
     lock(req.params.WalletId, ttl, function (done) {
     console.log("Lock acquired" + req.params.WalletId);
     // No one else will be able to get a lock on 'myLock' until you call done()  done();
     DbConn.Wallet.find({
     where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
     }).then(function (wallet) {
     if (wallet) {
     var amount = parseFloat(req.body.Amount);
     var walData = {
     CurrencyISO: wallet.CurrencyISO,
     StripeId: req.params.cardId
     };
     directPayment.BuyCredit(walData, amount).then(function (charge) {
     DbConn.Wallet
     .update(
     {
     Credit: wallet.Credit + amount
     },
     {
     where: [{WalletId: wallet.WalletId}]
     }
     ).then(function (cmp) {
     var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
     logger.info('BuyCredit - Update Wallet - [%s] .', jsonString);
     done();
     res.end(jsonString);
     var data = {
     StripeId: undefined,
     Description: undefined,
     CurrencyISO: undefined,
     Credit: cmp.Credit,
     Tag: undefined,
     TenantId: req.user.tenant,
     CompanyId: req.user.company,
     OtherJsonData: {"msg": "BuyCredit", "invokeBy": req.user.iss},
     WalletId: cmp.WalletId
     };
     addHistory(data);
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
     done();
     res.end(jsonString);
     });
     }, function (error) {
     var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
     logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
     done();
     res.end(jsonString);
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
     logger.error('[BuyCredit] - [%s] ', jsonString);
     done();
     res.end(jsonString);
     }
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('[BuyCredit] - [%s] ', jsonString);
     done();
     res.end(jsonString);
     });
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("No Wallet ID"), "EXCEPTION", false, undefined);
     logger.error('[BuyCredit] - [%s] ', jsonString);
     res.end(jsonString);
     }*/
};

/*module.exports.DeductCredit = function (req, res) {
 lock(req.params.WalletId, ttl, function (done) {
 console.log("Lock acquired" + req.params.WalletId);
 // No one else will be able to get a lock on 'myLock' until you call done()  done();
 DbConn.Wallet.find({
 where: [{WalletId: req.params.WalletId}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
 }).then(function (wallet) {
 if (wallet) {
 var amount = parseFloat(req.body.Amount);
 var credit = parseFloat(wallet.Credit);
 if (credit > amount) {
 credit = credit - amount;
 DbConn.Wallet
 .update(
 {
 Credit: credit
 },
 {
 where: [{WalletId: wallet.WalletId}]
 }
 ).then(function (cmp) {
 var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, credit);
 logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
 done();
 res.end(jsonString);
 var data = {
 StripeId: undefined,
 Description: req.body.Reason,
 CurrencyISO: undefined,
 Credit: credit,
 Tag: undefined,
 TenantId: req.user.tenant,
 CompanyId: req.user.company,
 OtherJsonData: {"msg": "DeductCredit", "amount": amount, "invokeBy": req.user.iss},
 WalletId: cmp.WalletId
 };
 addHistory(data);
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
 done();
 res.end(jsonString);
 });
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
 logger.error('[DeductCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 }
 }
 else {
 var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
 logger.error('[DeductCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 }
 }).error(function (err) {
 var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
 logger.error('[DeductCredit] - [%s] ', jsonString);
 done();
 res.end(jsonString);
 });
 });
 };*/

module.exports.DeductCredit = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            var amount = parseFloat(req.body.Amount);
            var credit = parseFloat(wallet.Credit);
            if (credit > amount) {
                deductCredit(req, wallet, credit, amount).then(function (cmp) {
                    var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                    logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
                    res.end(jsonString);
                }, function (error) {
                    var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                    logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
                    res.end(jsonString);
                });
            }
            else {
                if (wallet.AutoRecharge) {
                    if (wallet.ThresholdValue > credit) {
                        var b = wallet.AutoRechargeAmount - credit;
                        if (b > 0 && b > amount) {
                            buyCredit(wallet.WalletId, b, req.body.user).then(function (cmp) {
                                if (cmp > amount) {
                                    deductCredit(req, wallet, credit, amount).then(function (cmp) {
                                        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                                        logger.info('DeductCredit-buyCredit - Update Wallet - [%s] .', jsonString);
                                        res.end(jsonString);
                                    }, function (error) {
                                        var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                                        logger.error('DeductCredit-buyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                                        res.end(jsonString);
                                    });
                                }
                                else {
                                    var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                                    logger.error('[DeductCredit] - [%s] ', jsonString);
                                    res.end(jsonString);
                                }

                            }, function (error) {
                                var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                                logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                                res.end(jsonString);
                            });
                        }
                        else {
                            var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                            logger.error('[DeductCredit] - [%s] ', jsonString);
                            res.end(jsonString);
                        }
                    }
                    else {
                        var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                        logger.error('[DeductCredit] - [%s] ', jsonString);
                        res.end(jsonString);
                    }
                }
                else {
                    var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                    logger.error('[DeductCredit] - [%s] ', jsonString);
                    res.end(jsonString);
                }
            }
        }
        else {
            var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
            logger.error('[DeductCredit] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[DeductCredit] - [%s] ', jsonString);
        res.end(jsonString);
    });


};

module.exports.DeductCreditFormCustomer = function (req, res) {

    DbConn.Wallet.find({
        where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            var amount = parseFloat(req.body.Amount);
            var credit = parseFloat(wallet.Credit);
            if (credit > amount) {
                deductCredit(req, wallet, credit, amount).then(function (cmp) {
                    var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                    logger.info('DeductCredit - Update Wallet - [%s] .', jsonString);
                    res.end(jsonString);
                }, function (error) {
                    var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                    logger.error('DeductCredit - Fail To Update Wallet. - [%s] .', jsonString);
                    res.end(jsonString);
                });
            }
            else {
                if (wallet.AutoRecharge) {
                    buyCredit(wallet.WalletId, wallet.AutoRechargeAmount, req.body.user).then(function (cmp) {
                        if (cmp > amount) {
                            deductCredit(req, wallet, credit, amount).then(function (cmp) {
                                var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
                                logger.info('DeductCredit-buyCredit - Update Wallet - [%s] .', jsonString);
                                res.end(jsonString);
                            }, function (error) {
                                var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                                logger.error('DeductCredit-buyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                                res.end(jsonString);
                            });
                        }
                        else {
                            var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                            logger.error('[DeductCredit] - [%s] ', jsonString);
                            res.end(jsonString);
                        }

                    }, function (error) {
                        var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
                        logger.error('BuyCredit - Fail To Update Wallet. - [%s] .', jsonString);
                        res.end(jsonString);
                    });
                }
                else {
                    var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
                    logger.error('[DeductCredit] - [%s] ', jsonString);
                    res.end(jsonString);
                }
            }
        }
        else {
            var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
            logger.error('[DeductCredit] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[DeductCredit] - [%s] ', jsonString);
        res.end(jsonString);
    });

    /*DbConn.Wallet.find({
     where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
     }).then(function (wallet) {
     if (wallet) {
     lock(wallet.WalletId, ttl, function (done) {
     console.log("Lock acquired" + req.params.WalletId);
     // No one else will be able to get a lock on 'myLock' until you call done()  done();
     var amount = parseFloat(req.body.Amount);
     var credit = parseFloat(wallet.Credit);
     if (credit > amount) {
     credit = credit - amount;
     DbConn.Wallet
     .update(
     {
     Credit: credit
     },
     {
     where: [{WalletId: wallet.WalletId}]
     }
     ).then(function (cmp) {
     var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
     logger.info('DeductCreditFormCustomer - Update Wallet - [%s] .', jsonString);
     done();
     res.end(jsonString);
     var data = {
     StripeId: undefined,
     Description: req.body.Reason,
     CurrencyISO: undefined,
     Credit: credit,
     Tag: undefined,
     TenantId: req.user.tenant,
     CompanyId: req.user.company,
     OtherJsonData: {"msg": "DeductCredit", "amount": amount, "invokeBy": req.user.iss},
     WalletId: cmp.WalletId
     };
     addHistory(data);
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('DeductCreditFormCustomer - Fail To Update Wallet. - [%s] .', jsonString);
     done();
     res.end(jsonString);
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Insufficient  Credit Balance."), "EXCEPTION", false, undefined);
     logger.error('[DeductCreditFormCustomer] - [%s] ', jsonString);
     done();
     res.end(jsonString);
     }
     });
     }
     else {
     var jsonString = messageFormatter.FormatMessage(new Error("Invalid Wallet ID"), "EXCEPTION", false, undefined);
     logger.error('[DeductCreditFormCustomer] - [%s] ', jsonString);
     res.end(jsonString);
     }
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('[DeductCreditFormCustomer] - [%s] ', jsonString);
     res.end(jsonString);
     });*/
};

module.exports.CreditBalance = function (req, res) {

    DbConn.Wallet.find({
        where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, 0);
        if (wallet) {
            var data = {
                "WalletId": wallet.WalletId,
                "Credit": wallet.Credit,
                "AutoRechargeAmount": wallet.AutoRechargeAmount,
                "AutoRecharge": wallet.AutoRecharge,
                "ThresholdValue": wallet.ThresholdValue
            };
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, data);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", false, undefined);
        }
        logger.info('CreditBalance -  Wallet - [%s] .', jsonString);
        res.end(jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[CreditBalance] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.CreditBalanceById = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, 0);
        if (wallet) {
            var data = {
                "WalletId": wallet.WalletId,
                "Credit": wallet.Credit
            };
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, data);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", false, 0);
        }
        logger.info('CreditBalance -  Wallet - [%s] .', jsonString);
        res.end(jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[CreditBalance] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.AddNewCard = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            directPayment.AddNewCard(wallet.StripeId, req.headers['api_key']).then(function (customer) {

                var jsonString = messageFormatter.FormatMessage(undefined, "Add new Card Successfully.", true, customer.id);
                logger.info('AddNewCard - Update Wallet - [%s] .', jsonString);
                res.end(jsonString);

                var data = {
                    StripeId: wallet.StripeId,
                    Description: req.body.Description,
                    CurrencyISO: undefined,
                    Credit: 0,
                    Tag: undefined,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company,
                    OtherJsonData: {"msg": "AddNewCard", "Data": customer, "invokeBy": req.user.iss},
                    WalletId: wallet.WalletId
                };
                addHistory(data);

            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('CreatePackage-DirectPayment - Fail To Create Wallet. - [%s] .', jsonString);
                res.end(jsonString);
            });
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[AddNewCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[AddNewCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.RemoveCard = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            directPayment.ListCards(wallet.StripeId).then(function (cards) {
                if (cards.data && cards.data.length > 1) {
                    directPayment.DeleteCard(wallet.StripeId, req.params.CardId).then(function (customer) {
                        if (customer.deleted) {
                            var jsonString = messageFormatter.FormatMessage(undefined, "Card Was Removed Form System.", true, customer.id);
                            logger.info('RemoveCard - Update Wallet - [%s] .', jsonString);
                            res.end(jsonString);
                            var data = {
                                StripeId: wallet.StripeId,
                                Description: undefined,
                                CurrencyISO: undefined,
                                Credit: 0,
                                Tag: undefined,
                                TenantId: req.user.tenant,
                                CompanyId: req.user.company,
                                OtherJsonData: {"msg": "RemoveCard", "Data": customer, "invokeBy": req.user.iss},
                                WalletId: wallet.WalletId
                            };
                            addHistory(data);
                        }
                        else {
                            var jsonString = messageFormatter.FormatMessage(undefined, "Fail To Remove Card form Wallet", false, undefined);
                            logger.error('RemoveCard-DirectPayment - Fail To Remove Card form Wallet. - [%s] .', jsonString);
                            res.end(jsonString);
                        }
                    }, function (err) {
                        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                        logger.error('RemoveCard-DirectPayment - Fail To Remove Card form  Wallet. - [%s] .', jsonString);
                        res.end(jsonString);
                    });
                }
                else {
                    var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Card Details Or No Card Added. if You want to Delete Default Card, Please Contact System Administrator'.", false, undefined);
                    logger.error('RemoveCard - Fail To Get Card Details.. - [%s] .', jsonString);
                    res.end(jsonString);
                }
            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('RemoveCard - Fail To Get Card Details.. - [%s] .', jsonString);
                res.end(jsonString);
            });
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[RemoveCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[RemoveCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.ListCards = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            directPayment.ListCards(wallet.StripeId).then(function (cards) {

                var cardDetails = cards.data.map(function (item) {
                    var obj = {
                        id: item.id,
                        name: item.name,
                        brand: item.brand,
                        last4: item.last4
                    };
                    return obj
                });

                var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cardDetails);
                logger.info('ListCards - Get Card Details. - [%s] .', jsonString);
                res.end(jsonString);
            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('ListCards - Fail To Get Card Details.. - [%s] .', jsonString);
                res.end(jsonString);
            });
        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[RemoveCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[RemoveCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

module.exports.SetDefaultCard = function (req, res) {

    DbConn.Wallet.find({
        where: [{WalletId: req.params.WalletId}, {Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {

            directPayment.SetDefaultCard(wallet.StripeId, req.params.CardId).then(function (cards) {
                var jsonString = messageFormatter.FormatMessage(undefined, "Successfully Set Default card", true, undefined);
                logger.info('SetDefaultCard - . - [%s] .', jsonString);
                res.end(jsonString);

                var data = {
                    StripeId: wallet.StripeId,
                    Description: undefined,
                    CurrencyISO: undefined,
                    Credit: 0,
                    Tag: undefined,
                    TenantId: req.user.tenant,
                    CompanyId: req.user.company,
                    OtherJsonData: {"msg": "SetDefaultCard", "Data": cards, "invokeBy": req.user.iss},
                    WalletId: wallet.WalletId
                };
                addHistory(data);

            }, function (err) {
                var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
                logger.error('SetDefaultCard - Fail Set Default Card. - [%s] .', jsonString);
                res.end(jsonString);
            });

        }
        else {
            var jsonString = messageFormatter.FormatMessage(undefined, "Invalid Wallet ID", false, undefined);
            logger.error('[SetDefaultCard] - [%s] ', jsonString);
            res.end(jsonString);
        }
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[SetDefaultCard] - [%s] ', jsonString);
        res.end(jsonString);
    });
};

var addHistory = function (data) {

    DbConn.WalletHistory
        .create(
            {
                StripeId: data.customerId,
                Description: data.Description,
                CurrencyISO: data.CurrencyISO,
                Credit: data.Credit,
                TenantId: data.TenantId,
                CompanyId: data.CompanyId,
                OtherJsonData: data.OtherJsonData,
                WalletId: data.WalletId,
                Operation: data.Operation,
                InvokeBy: data.InvokeBy,
                Reason: data.Reason
            }
        ).then(function (cmp) {
        var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
        logger.info('addHistory - Create WalletHistory - [%s] .', jsonString);
    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('addHistory - Fail To Create WalletHistory. - [%s] .', jsonString);
    });

};


module.exports.getWalletHistory = function (req, res) {

    var pageNo = req.params.pageNo;
    var rowCount = req.params.rowCount;


    /*DbConn.Wallet.find({
     where: [{Owner: req.user.iss}, {TenantId: req.user.tenant}, {CompanyId: req.user.company}, {Status: true}]
     }).then(function (walletData) {
     var jsonString ;
     if (walletData) {*/

    DbConn.WalletHistory.findAll({
        where: [{TenantId: req.user.tenant}, {CompanyId: req.user.company}],
        order: [['createdAt', 'DESC']],
        offset: ((pageNo - 1) * rowCount),
        limit: rowCount

    }).then(function (walletHistory) {
        var jsonString;
        if (walletHistory) {

            jsonString = messageFormatter.FormatMessage(undefined, "SUCCESS", true, walletHistory);
            res.end(jsonString);
        }
        else {
            jsonString = messageFormatter.FormatMessage(undefined, "NO HISTORY RECORD FOUND", false, 0);
            res.end(jsonString);
        }

    }).error(function (err) {
        var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
        logger.error('[wallet history ] - [%s] ', jsonString);
        res.end(jsonString);
    });

    /*}
     else
     {
     jsonString = messageFormatter.FormatMessage(undefined, "NO WALLET RECORD FOUND", false, 0);
     res.end(jsonString);
     }
     }).error(function (err) {
     var jsonString = messageFormatter.FormatMessage(err, "EXCEPTION", false, undefined);
     logger.error('[Search wallet data ] - [%s] ', jsonString);
     res.end(jsonString);
     });*/


};

var LockCredit = function (sessionId,amount, invokeBy, reason, tenant, company) {

    var deferred = Q.defer();
    DbConn.Wallet.find({
        where: [{TenantId: tenant}, {CompanyId: company}, {Status: true}]
    }).then(function (wallet) {
        if(!sessionId){
            deferred.reject(new Error("Invalid Session Id."));
            return;
        }
        if (wallet) {
            redlock.lock('lock:'+sessionId, ttl, function (done) {
                var credit = parseFloat(wallet.Credit);
                var lockCredit = parseFloat(wallet.LockCredit);
                if (credit > amount) {
                    credit = credit - amount;
                    lockCredit = lockCredit + amount;
                    DbConn.Wallet
                        .update(
                            {
                                Credit: credit,
                                LockCredit: lockCredit
                            },
                            {
                                where: [{WalletId: wallet.WalletId}]
                            }
                        ).then(function (cmp) {
                        done();
                        if (cmp[0] === 1) {
                            deferred.resolve(credit);
                        }
                        else {
                            deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                        }
                        var data = {
                            StripeId: undefined,
                            Description: "Lock Credit",
                            CurrencyISO: undefined,
                            Credit: credit,
                            Tag: undefined,
                            TenantId: tenant,
                            CompanyId: company,
                            OtherJsonData: {
                                "msg": "DeductCredit",
                                "amount": amount, "Balance": credit,
                                "LockCredit": amount,
                                "invokeBy": invokeBy,
                                "OtherJsonData": "{'sessionId':"+sessionId+"}"
                            },
                            WalletId: cmp.WalletId,
                            Operation: 'DeductCredit',
                            InvokeBy: invokeBy,
                            Reason: reason ? reason : "Credit Locked By System"
                        };
                        addHistory(data);
                    }).error(function (error) {
                        done();
                        deferred.reject(error);
                    });
                }
                else {
                    done();
                    deferred.reject(new Error("Insufficient  Credit Balance."));
                }
            });
        }
        else {
            deferred.reject(new Error("Fail to Find Wallet. Please Contact System Administrator."));
        }
    }).error(function (err) {
        deferred.reject(err);
    });

    return deferred.promise;

};

var ReleaseCredit = function (sessionId,amount,invokeBy, reason, tenant, company) {

    var deferred = Q.defer();
    DbConn.Wallet.find({
        where: [{TenantId: tenant}, {CompanyId: company}, {Status: true}]
    }).then(function (wallet) {
        if (wallet) {
            var walletId = sessionId? sessionId: wallet.WalletId;
            lock(walletId, ttl, function (done) {
                var lockCredit = parseFloat(wallet.LockCredit) - parseFloat(amount);
                if(lockCredit<0){
                    deferred.reject(new Error("Invalid Amount. Please Contact System Administrator."));
                    return ;
                }
                var credit = parseFloat(wallet.Credit) + parseFloat(amount);
                DbConn.Wallet
                    .update(
                        {
                            Credit: credit,
                            LockCredit: lockCredit
                        },
                        {
                            where: [{WalletId: wallet.WalletId}]
                        }
                    ).then(function (cmp) {
                    done();
                    if (cmp[0] === 1) {
                        deferred.resolve(credit);
                    }
                    else {
                        deferred.reject(new Error("Fail to Update Wallet. Please Contact System Administrator."));
                    }
                    var data = {
                        StripeId: undefined,
                        Description: "Release Credit",
                        CurrencyISO: undefined,
                        Credit: credit,
                        Tag: undefined,
                        TenantId: tenant,
                        CompanyId: company,
                        OtherJsonData: {
                            "msg": "DeductCredit",
                            "amount": wallet.LockCredit, "Balance": credit,
                            "LockCredit": wallet.LockCredit,
                            "invokeBy": invokeBy,
                            "OtherJsonData": undefined
                        },
                        WalletId: cmp.WalletId,
                        Operation: 'DeductCredit',
                        InvokeBy: invokeBy,
                        Reason: reason ? reason : "Credit Released By System"
                    };
                    addHistory(data);
                }).error(function (error) {
                    done();
                    deferred.reject(error);
                });
            });
        }
        else {
            deferred.reject(new Error("Fail to Find Wallet. Please Contact System Administrator."));
        }
    }).error(function (err) {
        deferred.reject(err);
    });

    return deferred.promise;

};

module.exports.LockCreditFromCustomer = function (req, res) {
    if(!req.body.SessionId ||req.body.Amount<=0){
        var jsonString = messageFormatter.FormatMessage(new Error("Invalid Details."), "EXCEPTION", false, undefined);
        logger.error('LockCreditFromCustomer -  [%s] .', jsonString);
        res(jsonString);
    }
    else{
        LockCredit(req.body.SessionId,req.body.Amount, req.user.iss, req.body.Reason, req.user.tenant, req.user.company).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('LockCreditFromCustomer - [%s] .', jsonString);
            res(jsonString);
        }, function (error) {
            var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
            logger.error('LockCreditFromCustomer -  [%s] .', jsonString);
            res(jsonString);
        });
    }

};

module.exports.ReleaseCreditFromCustomer = function (req, res) {
    if(req.body.Amount<=0){
        var jsonString = messageFormatter.FormatMessage(new Error("Invalid Details."), "EXCEPTION", false, undefined);
        logger.error('LockCreditFromCustomer -  [%s] .', jsonString);
        res(jsonString);
    }
    else{
        ReleaseCredit(req.body.SessionId,req.body.Amount,req.user.iss, req.body.Reason, req.user.tenant, req.user.company).then(function (cmp) {
            var jsonString = messageFormatter.FormatMessage(undefined, "EXCEPTION", true, cmp);
            logger.info('ReleaseCredit - [%s] .', jsonString);
            res(jsonString);
        }, function (error) {
            var jsonString = messageFormatter.FormatMessage(error, "EXCEPTION", false, undefined);
            logger.error('ReleaseCredit -  [%s] .', jsonString);
            res(jsonString);
        });
    }

};
