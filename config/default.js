module.exports = {



    "DB": {
        "Type": "postgres",
        "User": "duo",
        "Password": "DuoS123",
        "Port": 5432,
        "Host": "104.236.231.11",
        "Database": "duo"
    },


    "Redis": {
        "ip": "45.55.142.207",
        "port": 6389,
        "password":"DuoS123",
        "redisdb":0,
        "ttl":30000,
        "mode":"sentinel",
        "sentinels":{
            "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
            "port":16389,
            "name":"redis-cluster"
        }
    },


    "Security":
    {
        "ip" : "45.55.142.207",
        "port": 6389,
        "user": "duo",
        "password": "DuoS123",
        "mode":"sentinel",//instance, cluster, sentinel
        "sentinels":{
            "hosts": "138.197.90.92,45.55.205.92,138.197.90.92",
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
        "ip": "45.55.142.207",
        "port": 5672,
        "user": "admin",
        "password": "admin",
        "vhost":'/'
    },


    "Mongo":
    {
        "ip":"45.55.142.207",
        "port":"27017",
        "dbname":"dvpdb",
        "password":"DuoS123",
        "user":"duo"
    },

    "Services" : {
        "accessToken":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdWtpdGhhIiwianRpIjoiYWEzOGRmZWYtNDFhOC00MWUyLTgwMzktOTJjZTY0YjM4ZDFmIiwic3ViIjoiNTZhOWU3NTlmYjA3MTkwN2EwMDAwMDAxMjVkOWU4MGI1YzdjNGY5ODQ2NmY5MjExNzk2ZWJmNDMiLCJleHAiOjE5MDIzODExMTgsInRlbmFudCI6LTEsImNvbXBhbnkiOi0xLCJzY29wZSI6W3sicmVzb3VyY2UiOiJhbGwiLCJhY3Rpb25zIjoiYWxsIn1dLCJpYXQiOjE0NzAzODExMTh9.Gmlu00Uj66Fzts-w6qEwNUz46XYGzE8wHUhAJOFtiRo",

        //http://192.168.1.16:3637/DVP/API/1.0.0.0/Organisations/1/100
        //"userServiceHost": "192.168.5.165",
        "userServiceHost": "userservice.app.veery.cloud",
        //192.168.1.16"userserrvice.app.veery.cloud",
        "userServicePort": "3637",
        "userServiceVersion": "1.0.0.0",
        //"walletServiceHost": "127.0.0.1",
        //"walletServiceHost": "192.168.0.39",
        "walletServiceHost": "walletservice.app.veery.cloud",
        "walletServicePort": "3333",
        "walletServiceVersion": "1.0.0.0",
        "monitorRestApiHost": "monitorrestapi.app.veery.cloud",
        "monitorRestApiPort": "",
        "monitorRestApiVersion": "1.0.0.0"


    }



};