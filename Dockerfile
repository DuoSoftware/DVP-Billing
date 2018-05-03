#FROM ubuntu
#RUN apt-get update
#RUN apt-get install -y git nodejs npm nodejs-legacy
#RUN git clone git://github.com/DuoSoftware/DVP-Billing.git /usr/local/src/billingservice
#RUN cd /usr/local/src/billingservice; npm install
#CMD ["nodejs", "/usr/local/src/billingservice/app.js"]

#EXPOSE 8881

FROM node:9.9.0
ARG VERSION_TAG
RUN git clone -b $VERSION_TAG https://github.com/DuoSoftware/DVP-Billing.git /usr/local/src/billingservice
RUN cd /usr/local/src/billingservice;
WORKDIR /usr/local/src/billingservice
RUN npm install
EXPOSE 8881
CMD [ "node", "/usr/local/src/billingservice/app.js" ]
