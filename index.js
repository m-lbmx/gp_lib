const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const { DCC } = require('dcc-utils');
const axios = require('axios');
const rs = require('jsrsasign');
const rules = require('./rules');

exports.handler = async (event) => {
    let qr_code = '';
    
    if(event.qr_code !== undefined){
      qr_code = event.qr_code;
    }else{
      const postParams = new URLSearchParams(event.body);
      qr_code = postParams.get("qr_code");
    }
    
    let dcc;

    try {
        dcc = await DCC.fromRaw(qr_code);
    } catch (error) {
        console.error('green pass parser failed', error);

        return {
            statusCode: 200,
            body: JSON.stringify({
                validation: false,
                parse_valid: false
            })
        };
    }

    let certAndSettings = await getCertAndSettings();
    let certificates = certAndSettings.certs;
    let settings = certAndSettings.settings;

    let parse_valid = false;

    if (dcc.payload.v) {
        parse_valid = rules.checkVacRules(settings, dcc.payload.v[dcc.payload.v.length - 1]);
    }

    if (dcc.payload.t) {
        parse_valid = rules.checkTestRules(settings, dcc.payload.t[dcc.payload.t.length - 1]);
    }

    if (dcc.payload.r) {
        parse_valid = rules.checkRecRules(settings, dcc.payload.r[dcc.payload.r.length - 1]);
    }

    let validation = false;
    
    if (parse_valid) { // controllo la signature solo se il green pass non è scaduto

        for (let certificate of certificates) {
            try {
                //XXX Attenzione qua se non va il certificato svizzero rifarsi al sistema Dentella (prevede di aggiornare cose-js alla versione 0.7.0)
                validation = rs.KEYUTIL.getKey(certificate).getPublicKeyXYHex();
                validation = await dcc.checkSignature(verifier);
            } catch { }

            if (validation) {
                break;
            }

            // ------------- Sistema Dentella
            //     try {

            //         // get key and jwk from certificate
            //         key = rs.KEYUTIL.getKey(certificate);
            //         jwk = rs.KEYUTIL.getJWKFromKey(key);

            //         // EC key, the library expects x and y coordinates as hex strings
            //         if(jwk.kty == 'EC') {
            //             verifier = {
            //                 x: Buffer.from(jwk.x, 'base64').toString('hex'),
            //                 y: Buffer.from(jwk.y, 'base64').toString('hex')
            //             };
            //         }

            //         // RSA key, the library expects modulus and exponent as Buffers
            //         else if(jwk.kty == 'RSA') {
            //             verifier = {
            //                 n: Buffer.from(jwk.n, 'base64'),
            //                 e: Buffer.from(jwk.e, 'base64')
            //             };
            //         }

            //         verified = await dcc.checkSignature(verifier);
            //     } catch {}
            //     if(verified) break;


        }

        // -------------- Metodo async che li verifica tutti ma molto lento
        // let array_verifiers = await Promise.allSettled(certificates.map(async (cert)=>{
        //     let result = false
        //     try {
        //         result = await dcc.checkSignature(rs.KEYUTIL.getKey(cert).getPublicKeyXYHex());
        //     } catch (error) {

        //     }

        //     if(result){
        //         return 'valido'
        //     }else{
        //         return false
        //     }
        // }));

        // array_verifiers.forEach(r => {
        //     if(r.status == 'fulfilled' && r.value == 'valido'){
        //         verified = true;
        //     }
        // })
    }



    const response = {
        statusCode: 200,
        body: JSON.stringify({
            validation: validation ? true : false,
            parse_valid: parse_valid,
            dati: {
                nome: dcc.payload.nam.gn,
                cognome: dcc.payload.nam.fn
            }
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
        // in dynamodb fetcho i certificati anche dal governo svedese che li divide per nazione. Così posso mettere come primo certificato da verififcare quelli italiani.
        r.Items.forEach(item => {
            if (item.it) {
                array_certs.unshift(item.cert);
            } else {
                array_certs.push(item.cert);
            }
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
                if (item.it) {
                    array_certs.unshift(item.cert);
                } else {
                    array_certs.push(item.cert);
                }
            });

            return array_certs
        })
    }

    let settings;

    if (!cert_status.settings) {
        let url_settings = process.env.URL_SETTINGS;
        let fetch_settings = await axios.get(url_settings);
        settings = fetch_settings.data;
    } else {
        settings = cert_status.settings
    }

    return {
        certs: certs,
        settings: settings
    }
}
