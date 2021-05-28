module.exports = {
    "DB": {
        "Type":"SYS_DATABASE_TYPE",
        "User":"SYS_DATABASE_POSTGRES_USER",
        "Password":"SYS_DATABASE_POSTGRES_PASSWORD",
        "Port":"SYS_SQL_PORT",
        "Host":"SYS_DATABASE_HOST",
        "Database":"SYS_DATABASE_POSTGRES_USER"
    },


    "Redis":
    {
        "mode":"SYS_REDIS_MODE",
        "ip": "SYS_REDIS_HOST",
        "port": "SYS_REDIS_PORT",
        "user": "SYS_REDIS_USER",
        "password": "SYS_REDIS_PASSWORD",
        "sentinels":{
            "hosts": "SYS_REDIS_SENTINEL_HOSTS",
            "port":"SYS_REDIS_SENTINEL_PORT",
            "name":"SYS_REDIS_SENTINEL_NAME"
        }

    },

    "Security":
    {
        "ip": "SYS_REDIS_HOST",
        "port": "SYS_REDIS_PORT",
        "user": "SYS_REDIS_USER",
        "password": "SYS_REDIS_PASSWORD",
        "mode":"SYS_REDIS_MODE",
        "sentinels":{
            "hosts": "SYS_REDIS_SENTINEL_HOSTS",
            "port":"SYS_REDIS_SENTINEL_PORT",
            "name":"SYS_REDIS_SENTINEL_NAME"
        }

    },

    "Mongo":
    {
        "ip":"SYS_MONGO_HOST",
        "port":"SYS_MONGO_PORT",
        "dbname":"SYS_MONGO_DB",
        "password":"SYS_MONGO_PASSWORD",
        "user":"SYS_MONGO_USER"

    },

    "RabbitMQ":
    {
        "ip": "SYS_RABBITMQ_HOST",
        "port": "SYS_RABBITMQ_PORT",
        "user": "SYS_RABBITMQ_USER",
        "password": "SYS_RABBITMQ_PASSWORD"
    },


    "Host":
    {
        "type" : "HOST_TYPE",
        "vdomain": "LB_FRONTEND",
        "domain": "HOST_NAME",
        "port": "HOST_BILLINGSERVICE_PORT",
        "version": "HOST_VERSION",
        "billingDate": "BILLING_DATE",
        "reschedulefreqency": "BILLING_SCHEDULE_FREQUENCY",
        "rescheduletries": "BILLING_SCHEDULE_TRIES",
        "EmailWarningActDay": "BILLING_EMAIL_WARNING_ACTIVATION",
        "SmsWarningActDay": "BILLING_SMS_WARNING_ACTIVATION",
        "CallWarningActDay": "BILLING_CALL_WARNING_ACTIVATION",
        "diameterDomain": "HOST_DIAMETERSERVER_NAME",
        "diameterPort": "HOST_DIAMETERSERVER_PORT",
        "tenantBilling" : "HOST_TENANTBILLING_ENABLED",
        "userBilling" : "HOST_USERBILLING_ENABLED",
        "TenantName": "HOST_TENANT_NAME"

    },
    "Tenant":
        {
            "activeTenant": "SYS_ACTIVE_TENANT"
        },

    "LBServer" : {

        "ip": "LB_FRONTEND",
        "port": "LB_PORT"

    },


    "Services" : {
        "accessToken": "HOST_TOKEN",
        "userServiceHost": "SYS_USERSERVICE_HOST",
        "userServicePort": "SYS_USERSERVICE_PORT",
        "userServiceVersion": "SYS_USERSERVICE_VERSION",

        "walletServiceHost": "SYS_WALLETSERVICE_HOST",
        "walletServicePort":  "SYS_WALLETSERVICE_PORT",
        "walletServiceVersion":  "SYS_WALLETSERVICE_VERSION",

        "monitorRestApiHost": "SYS_MONITORRESTAPI_HOST",
        "monitorRestApiPost":  "SYS_MONITORRESTAPI_PORT",
        "monitorRestApiVersion":  "SYS_MONITORRESTAPI_VERSION"
    }
};