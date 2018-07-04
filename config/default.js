module.exports = {



    "DB": {
        "Type": "postgres",
        "User": "",
        "Password": "122",
        "Port": 5432,
        "Host": "",
        "Database": ""
    },


    "Redis": {
        "ip": "",
        "port": 6389,
        "password":"",
        "redisdb":0,
        "ttl":30000,
        "mode":"sentinel",
        "sentinels":{
            "hosts": "",
            "port":16389,
            "name":"redis-cluster"
        }
    },


    "Security":
    {
        "ip" : "",
        "port": 6389,
        "user": "",
        "password": "",
        "mode":"sentinel",//instance, cluster, sentinel
        "sentinels":{
            "hosts": "",
            "port":16389,
            "name":"redis-cluster"
        }
    },


    "Host":
    {
        "type" : "http",
        "vdomain": "localhost",
        "domain": "localhost",
        "port": "4444",
        "version": "1.0.0.0",
        "billingDate": "28",
        "reschedulefreqency": "1",
        "rescheduletries": "15",
        "EmailWarningActDay": "12",
        "diameterDomain": "localhost",
        "diameterPort": "5555",
        "tenantBilling" : true,
        "userBilling" : false,
        "TenantName": "Dialog",
		"emailUserArray" : ["kalana@duosoftware.com","champaka@duosoftware.com"]
    },

    "LBServer" : {

        "ip": "localhost",
        "port": "3434"

    },

    "RabbitMQ":
    {
        "ip": "",
        "port": 5672,
        "user": "",
        "password": "",
        "vhost":'/'
    },


    "Mongo":
    {
        "ip":"",
        "port":"27017",
        "dbname":"",
        "password":"",
        "user":""
    },

    "Services" : {
        "accessToken":"",

        
        //"userServiceHost": "192.168.5.165",
        "userServiceHost": "",
       
        "userServicePort": "3637",
        "userServiceVersion": "1.0.0.0",
        //"walletServiceHost": "127.0.0.1",
        
        "walletServiceHost": "",
        "walletServicePort": "3333",
        "walletServiceVersion": "1.0.0.0",
        "monitorRestApiHost": "",
        "monitorRestApiPort": "",
        "monitorRestApiVersion": "1.0.0.0"


    }



};
