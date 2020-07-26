/**
 * Created by Kalana on 5/15/2017.
 */

var crypto = require('crypto'),
    algorithm = 'aes-256-ctr',
    password = 'DuoS123412341234';
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');
var config = require('config');
var scheduler = require('./scheduler');
var redisToeknValidator = require('../Control/billingSessionValidator');



function validateToken(data, callback) {



    generateToken(data.billToken, function (found) {
        var token = found;

        var jsonString;
        if (data.billToken == token) {
            scheduler.setBilled(true);
            console.log('Valid Bill Token');
            jsonString = messageFormatter.FormatMessage(undefined, 'Subscription has been renewed successfully', true);
            callback(jsonString);
        }
        else {
            console.log('Invalid Bill Token');
            jsonString = messageFormatter.FormatMessage({ message: "ERROR : INVALID TOKEN" }, 'Invalid Bill Token', false);
            callback(jsonString);
        }
    });


}




function generateToken(found, callback) {

    if (found == null) {
        var monthNames = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        var date = new Date();
        var day = date.getDate(),
            month = monthNames[date.getMonth()],
            year = date.getFullYear();

        var monthcombo;
        if (12 == date.getMonth()) {
            monthcombo = monthNames[date.getMonth()] + '-' + monthNames[1]
        }
        else if (11 == date.getMonth()) {
            monthcombo = monthNames[date.getMonth()] + '-' + monthNames[0]
        }
        else {
            monthcombo = monthNames[date.getMonth()] + '-' + monthNames[date.getMonth() + 2]

        }

        //var encstring = config.Host.TenantName+'-'+config.Host.rescheduletries+"-"+monthcombo+"-"+year;
        var encstring = config.Tenant.activeTenant + '-' + config.Host.rescheduletries + "-" + monthcombo + "-" + year;



        encstring = crypto.createHash('md5').update(encstring).digest('hex');
        console.log('Token: ' + encstring);
        //console.log('Token: '+ encstring);
        //console.log('Encrypted Token: '+ Encrypt(encstring,'DuoS123412341234'));
        //var key = config.Host.TenantName + "_BILL_HASH_TOKEN";
        var key = config.Tenant.activeTenant + "_BILL_HASH_TOKEN";
        redisToeknValidator.save(key, encstring, function (err, found) {

            if (err) {
                console.log('REDIS ERROR');
                callback(null);
            }
            else if (found) {
                callback(encstring);
            }
        }, 7776000);

    }

    else if (found) {
        //var key = config.Host.TenantName + "_BILL_HASH_TOKEN";
        var key = config.Tenant.activeTenant + "_BILL_HASH_TOKEN";
        redisToeknValidator.get(key, function (err, val) {

            if (err) {
                console.log('REDIS ERROR');
                callback(null);
            }
            else {
                if (val == null) {                    
                    var encstring = decrypt(found);
                    var hashKey = config.Tenant.activeTenant + "_BILL_HASH_TOKEN";
                    redisToeknValidator.save(hashKey, encstring, function (error, saved) {
                        if (error) {
                            console.log('REDIS ERROR');
                            callback(null);
                        }
                        else if (saved) {
                            callback(found);
                        }
                    }, 7776000);
                } else if (val == decrypt(found)) {
                    callback(found);
                } else {
                    callback(null);
                }
            }
        });


    }

}

function Encrypt(plainText, workingKey) {
    try {
        var key = workingKey;
        var iv = '0123456789@#$%&*';
        var cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
        var encoded = cipher.update(plainText, 'utf8', 'hex');
        encoded += cipher.final('hex');
        return encoded;

    }
    catch (e) {
        return null;
    }


}


/*function encrypt(text){
 try {

 var cipher = crypto.createCipheriv(algorithm,password,iv);
 var crypted = cipher.update(text,'utf8','hex');
 crypted += cipher.final('hex');
 return crypted;
 }
 catch (e){

 console.log(e);

 }

 }*/

function decrypt(text) {
    try {
        var iv = '0123456789@#$%&*';
        var decipher = crypto.createDecipheriv('aes-128-ctr', password, iv);
        var dec = decipher.update(text, 'hex', 'utf8');
        dec += decipher.final('utf8');
        return dec;
    }
    catch (e) {
        return null;
    }

}

exports.validateToken = validateToken;
exports.generateToken = generateToken;

