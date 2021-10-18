const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const axios = require('axios');
const http = require('http');
const https = require('https');
const jose = require('node-jose');

exports.handler = async (event) => {
	let url_status = process.env.URL_STATUS;
	let url_update = process.env.URL_UPDATE;
	let url_settings = process.env.URL_SETTINGS;
	let datetime = new Date().toISOString();
	// get valid kids e salvo in dynamodb. -> todo controllare che differisca da quello già in db prima di fare l'update dei certificati o controllare che il last updated non sia oggi
	let fetch_valid_kids = await axios.get(url_status);
	let valid_kids = fetch_valid_kids.data;

	let fetch_settings = await axios.get(url_settings);
	let settings = fetch_settings.data;

	let params = {
		TableName: process.env.TABLE_NAME,
		Item: {
			PK: 'cert_status',
			valid_kids: ddb.createSet(valid_kids),
			last_updated: datetime,
			settings: settings
		}
	}

	await ddb.put(params).promise();

	let it_kids = await getItalianCerts();
	console.log(it_kids)
	let fetch_cert;
	let config = {
		httpAgent: new http.Agent({ keepAlive: true }),
		httpsAgent: new https.Agent({ keepAlive: true }),
	}

	let x_kid;
	let x_resume_token;
	let counter = 0;

	do {

		fetch_cert = await axios.get(url_update, config);

		if (fetch_cert.status === 200) {
			counter++;
			x_resume_token = fetch_cert.headers['x-resume-token'];
			x_kid = fetch_cert.headers['x-kid'];
			config.headers = { 'X-RESUME-TOKEN': x_resume_token }

			if (valid_kids.includes(x_kid)) {
				let cert = "-----BEGIN CERTIFICATE-----\n" + fetch_cert.data + "-----END CERTIFICATE-----"

				params = {
					TableName: process.env.TABLE_NAME,
					Item: {
						PK: x_kid,
						cert: cert,
						last_updated: datetime,
						it: it_kids.includes(x_kid)
					}
				}

				await ddb.put(params).promise();
			}
		}

	} while (fetch_cert.status == 200);

	const response = {
		statusCode: 200,
		body: JSON.stringify({
			valid_kids: valid_kids,
			certs_added: counter
		}),
	};
	return response;
};


const getItalianCerts = async () => {
	// il governo svedese pubblica i certificati (con un sistema complicato di criptazione) divisi per nazione. Lo utilizzo per sapere quali sono i cert italiani in modo da verificarli prima degli altri e velocizzare la lettura del green pass
	let it_kids = [];
	try {
		const URL_TRUST_LIST = process.env.URL_TRUST_LIST;
		const URL_TRUST_LIST_KEY = process.env.URL_TRUST_LIST_KEY;

		const fetch_key = await axios.get(URL_TRUST_LIST_KEY);
		const trust_list_key = fetch_key.data;

		let key = await jose.JWK.asKey(trust_list_key, 'pem').
			then(function (result) {
				return result;
			});

		const fetchati = await axios.get(URL_TRUST_LIST);

		let signatures = await jose.JWS.createVerify(key)
			.verify(fetchati.data)
			.then(function (result) {
				return JSON.parse(result.payload.toString());
			});
		
		signatures.dsc_trust_list.IT.keys.forEach(k => {
			it_kids.push(k.kid);
		})
		
	} catch (error) {
		console.error('errore nel fetchare dal governo svedese', error)
	}

	return it_kids
	
}