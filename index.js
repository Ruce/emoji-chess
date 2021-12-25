'use strict';

// Imports dependencies and set up http server
const
	express = require('express'),
	bodyParser = require('body-parser'),
	fetch = require('node-fetch'),
	app = express().use(bodyParser.json()); // creates express http server

const { Client } = require('pg');
const { URLSearchParams } = require('url');

// Connect to the PostgreSQL database
const client = new Client({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false
	}
});

const messageUrl = 'https://graph.facebook.com/v12.0/me/messages?' + new URLSearchParams({access_token: process.env.PAGE_ACCESS_TOKEN})

// Example POST method implementation:
async function postData(url = '', data = {}) {
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(data)
	});
	return response.json(); // parses JSON response into native JavaScript objects
}

// Sets server port and logs message on success
app.listen(process.env.PORT || 80, () => console.log('webhook is listening'));

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {	
 
	let body = req.body;

	// Checks this is an event from a page subscription
	if (body.object === 'page') {
	
		// Iterates over each entry - there may be multiple if batched
		body.entry.forEach(function(entry) {
			// Gets the message. entry.messaging is an array, but 
			// will only ever contain one message, so we get index 0
			let webhook_event = entry.messaging[0];
			console.log(webhook_event);
		
			let sender_psid = webhook_event.sender.id;
			console.log('Sender PSID: ' + sender_psid);
			
			client.connect();
			client.query('SELECT * FROM messages;', (err, res) => {
				if (err) throw err;
				
				let result = "hello";
				for (let row of res.rows) {
					result = String(row.sender_id);
				}
				client.end();
				
				let message_body = {
					messaging_type: "RESPONSE",
					recipient: {
						id: sender_psid
					},
					message: {
						text: result
					}
				}

				postData(messageUrl, message_body)
					.then(data => {
						console.log(data); // JSON data parsed by `data.json()` call
					});
			});
		});

		// Returns a '200 OK' response to all requests
		res.status(200).send('EVENT_RECEIVED');
	} else {
		// Returns a '404 Not Found' if event is not from a page subscription
		res.sendStatus(404);
	}

});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

	// Your verify token. Should be a random string.
	let VERIFY_TOKEN = "44904788-CDD6-493E-B670-4DD6C744AFFF"
		
	// Parse the query params
	let mode = req.query['hub.mode'];
	let token = req.query['hub.verify_token'];
	let challenge = req.query['hub.challenge'];
		
	// Checks if a token and mode is in the query string of the request
	if (mode && token) {
	
		// Checks the mode and token sent is correct
		if (mode === 'subscribe' && token === VERIFY_TOKEN) {
			
			// Responds with the challenge token from the request
			console.log('WEBHOOK_VERIFIED');
			res.status(200).send(challenge);
		
		} else {
			// Responds with '403 Forbidden' if verify tokens do not match
			res.sendStatus(403);			
		}
	}
});