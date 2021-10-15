const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const { DCC } = require('dcc-utils');
const axios = require('axios');
const rs = require('jsrsasign');
exports.handler = async (event) => {
    let dcc;

    try {
        dcc = await DCC.fromRaw(event.qr_code);
    } catch (error) {
        // XXX ERRORE DCC NON VALIDO
        console.log('errore', error)
    }

    let certAndSettings = await getCertAndSettings();
    let certificates = certAndSettings.certs;
    let settings = certAndSettings.settings;

    // XXX aggiungere gestione errori ovunque
    let verified = false;
    let verifier;
    for (let certificate of certificates) {
        try {
            verifier = rs.KEYUTIL.getKey(certificate).getPublicKeyXYHex();
            verified = await dcc.checkSignature(verifier);
        } catch{ }
        
        if(verified) {
            break;
        }
    }

    let validated = false;

    if(verified){
        if(dcc.payload.v){
            validated = checkVacRules(settings, dcc.payload.v);
        }   

        // if(dcc.payload.t){
        //     validated = checkTestRules(settings, dcc);
        // } 

        // if(dcc.payload.r){
        //     validated = checkRecRules(settings, dcc);
        // } 
    }

    const response = {
        statusCode: 200,
        body: JSON.stringify({
            verified: verified ? true : false,
            validated: validated,
            dcc: dcc.payload
        }),
    };

    return response;
};

const getCertAndSettings = async () => {
    let params = {
        TableName: process.env.TABLE_NAME,
        Key: {
            PK: 'cert_status'
        }
    };

    let cert_status = await ddb.get(params).promise().then(r => {
        return r.Item
    })

    params = {
        TableName: process.env.TABLE_NAME,
        FilterExpression: 'last_updated = :lu',
        ExpressionAttributeValues: { ':lu': cert_status.last_updated }
    }

    let certs = await ddb.scan(params).promise().then(r => {
        let array_certs = [];
        r.Items.forEach(item => {
            array_certs.push(item.cert);
        });

        return array_certs
    })

    if (certs == [] || !certs) {
        // Backup!!
        console.error('Backup certs from db without last_updated')
        params = {
            TableName: process.env.TABLE_NAME
        }

        certs = await ddb.scan(params).promise().then(r => {
            let array_certs = [];

            r.Items.forEach(item => {
                array_certs.push(item.cert);
            });

            return array_certs
        })
    }

    let settings;

    if(!cert_status.settings){
        let url_settings = process.env.URL_SETTINGS;
        let fetch_settings = await axios.get(url_settings);
        settings = fetch_settings.data;
    }else{
        settings = cert_status.settings
    }

    return {
        certs: certs,
        settings: settings
    }
}

const checkVacRules = (settings, data) =>{
    let vaccineType = data.mp;
    let doseNumber = data.dn;
    let dateOfVaccination = data.dt;
    let totalSeriesOfDoses = data.sd;
    let now = new Date().getTime();

    //XXX aggiungere gestione degli errori. 

    if(doseNumber < totalSeriesOfDoses) {
        let vaccine_start_day_not_complete = settings.find(rule => {
            return rule.name == 'vaccine_start_day_not_complete' && rule.type == vaccineType
        })
        let vaccine_end_day_not_complete = settings.find(rule => {
            return rule.name == 'vaccine_end_day_not_complete' && rule.type == vaccineType
        })
			
        let startDate = new Date(dateOfVaccination);
        startDate.setDate(startDate.getDate() + vaccine_start_day_not_complete);
        let endDate = new Date(dateOfVaccination);
        endDate.setDate(endDate.getDate() + vaccine_end_day_not_complete);

        if(startDate.getTime() > now || endDate.getTime() < now){
            return false
        }else{
            return true
        }
        
    }
    
    if(doseNumber >= totalSeriesOfDoses) {
        let vaccine_start_day_complete = settings.find(rule => {
            return rule.name == 'vaccine_start_day_complete' && rule.type == vaccineType
        })
        let vaccine_end_day_complete = settings.find(rule => {
            return rule.name == 'vaccine_end_day_complete' && rule.type == vaccineType
        })
			
        let startDate = new Date(dateOfVaccination);
        startDate.setDate(startDate.getDate() + vaccine_start_day_complete);
        let endDate = new Date(dateOfVaccination);
        endDate.setDate(endDate.getDate() + vaccine_end_day_complete);

        if(startDate.getTime() > now || endDate.getTime() < now){
            return false
        }else{
            return true
        }
    }
}
