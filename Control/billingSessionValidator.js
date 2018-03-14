/**
 * Created by dinusha on 12/22/2016.
 */
var redis = require("ioredis");
var Config = require('config');
var crypto = require('crypto');
var util = require('util');
var redisIp = Config.Redis.ip;
var redisPort = Config.Redis.port;
var redisPassword = Config.Redis.password;
var messageFormatter = require('dvp-common/CommonMessageGenerator/ClientMessageJsonFormatter.js');

//var client = redis.createClient(redisPort, redisIp);

var redisip = Config.Redis.ip;
var redisport = Config.Redis.port;
var redispass = Config.Redis.password;
var redismode = Config.Redis.mode;
var redisdb = Config.Redis.redisdb;



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

    if(Config.Redis.sentinels && Config.Redis.sentinels.hosts && Config.Redis.sentinels.port && Config.Redis.sentinels.name){
        var sentinelHosts = Config.Redis.sentinels.hosts.split(',');
        if(Array.isArray(sentinelHosts) && sentinelHosts.length > 2){
            var sentinelConnections = [];

            sentinelHosts.forEach(function(item){

                sentinelConnections.push({host: item, port:Config.Redis.sentinels.port})

            })

            redisSetting = {
                sentinels:sentinelConnections,
                name: Config.Redis.sentinels.name,
                password: redispass
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
                password: redispass});
        });

        var client = new redis.Cluster([redisSetting]);

    }else{

        client = new redis(redisSetting);
    }


}

client.on("error", function (err) {
    console.log('error', 'Redis connection error :: %s', err);
});

client.on("connect", function (err) {
    //client.select(Config.Redis.redisDB, redis.print);
    console.log("Redis Connect Success");
});

/*client.auth(redisPassword, function (redisResp) {
    console.log("Redis Auth Response : " + redisResp);
});*/


function validateToken(response){


    //var key = Config.Host.TenantName + "_BILL_TOKEN";
    //var key2 = Config.Host.TenantName + "_BILL_HASH_TOKEN";

    var key = "1_BILL_TOKEN";
    var key2 = "1_BILL_HASH_TOKEN";

    get(key, function(err, found1){

        get(key2 , function (err2, found2){

            var jsonString;
            if(found1 == Encrypt(found2,'DuoS123412341234') ){
                console.log('Valid Bill Token');
                jsonString = messageFormatter.FormatMessage(undefined, 'EXCEPTION', true);
                response(jsonString);

            }
            else if (err){
                console.log('Redis Error');
                jsonString = messageFormatter.FormatMessage(undefined, 'EXCEPTION', false);
                response(jsonString);
            }
            else{
                console.log('Invalid Bill Token');
                jsonString = messageFormatter.FormatMessage(undefined, 'EXCEPTION', false);
                response(jsonString);
            }


        });



    });


}



function Encrypt(plainText, workingKey) {

    var key =workingKey;
    var iv = '0123456789@#$%&*';
    var cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
    var encoded = cipher.update(plainText, 'utf8', 'hex');
    encoded += cipher.final('hex');
    return encoded;
}




function save(key, object, callback){
    client.set(key, object, function(err, reply) {
        //console.log('Redis Response :'+reply);
        callback(err, reply);
    });


}
function del(key){

    client.del(key, function(err, reply) {
        //console.log('Redis Response :'+reply);
        callback(err, reply);
    });


}

function get(key, callback){

    client.get(key, function(err, reply) {
        //console.log('Redis Response :'+reply);
        callback(err, reply);
    });


}




exports.validateToken = validateToken;
exports.del = del;
exports.save = save;
exports.get = get;
