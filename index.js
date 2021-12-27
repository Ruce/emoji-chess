'use strict';

// Imports dependencies and set up http server
const
	express = require('express'),
	bodyParser = require('body-parser'),
	fetch = require('node-fetch'),
	app = express().use(bodyParser.json()); // creates express http server

const { Client } = require('pg');
const { URLSearchParams } = require('url');
const { Chess } = require('chess.js')

const messageUrl = 'https://graph.facebook.com/v12.0/me/messages?' + new URLSearchParams({access_token: process.env.PAGE_ACCESS_TOKEN})

const symbols = {
	pieces: {
		w: {
			p: "🕯",
			n: "🦄",
			b: "🏃",
			r: "🏰",
			q: "👸",
			k: "🤴"
		},
		b: {
			p: "♟",
			n: "🐴",
			b: "🏃",
			r: "🕋",
			q: "👸",
			k: "🤴"
		}
	},
	board: {
		rank: ["8️⃣", "7️⃣", "6️⃣", "5️⃣", "4️⃣", "3️⃣", "2️⃣", "1️⃣"],
		file: ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭"],
		lightTile: "◽",
		darkTile: "◾",
		origin: "🏁"
	}
}

function outputBoard(board, isWhite = true) {
	let rows = [];
	
	// Iterate through tiles on the board (2D array)
	// Starts at the "top left" from white's perspective, i.e. 8th -> 1st rank and 'a' -> 'h' file
	for (let i = 0; i < 8; i++) {
		let row = [];
		for (let j = 0; j < 8; j++) {
			let piece = board[i][j];
			if (piece == null) {
				// Empty tile - work out if it is a light or dark square
				// Counting from the "top left":
				// (Even rank && even file) || (Odd rank && odd file) == light square
				// Else == dark square
				if ((i % 2) ^ (j % 2)) {
					row.push(symbols.board.darkTile);
				}
				else {
					row.push(symbols.board.lightTile);
				}
			} else {
				row.push(symbols.pieces[piece.color][piece.type]);
			}
		}
		
		if (isWhite) {
			row.unshift(symbols.board.rank[i]); // Add rank number indicators
			rows.push(row.join(""));
		} else {
			// From black's perspective, horizontally mirror rows and build board from bottom up
			row.reverse()
			row.unshift(symbols.board.rank[i]); // Add rank number indicators
			rows.unshift(row.join(""));
		}
	}
	
	let output = rows.join("\n");
	if (isWhite) {
		let xAxis = symbols.board.origin + symbols.board.file.join(""); // Add file indicators
		output += "\n" + xAxis;
	} else {
		let xAxis = symbols.board.origin + symbols.board.file.slice().reverse().join(""); // Add file indicators
		output += "\n" + xAxis;
	}
	return output;
}

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

async function createClient() {
	// Creates a new client and connects to the PostgreSQL database
	const client = new Client({
		connectionString: process.env.DATABASE_URL,
		ssl: {
			rejectUnauthorized: false
		}
	});
	await client.connect();
	return client;
}

async function newGame(sender_id) {
	// Connect to the PostgreSQL database
	const client = await createClient();
}

async function makeMove(sender_id, move) {
	const client = await createClient();
	
	let fen;
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const select_res = await client.query(select, [sender_id]);
	fen = select_res.rows[0].fen;
	console.log('Old fen: ' + fen);
	
	const chess = new Chess(fen);
	chess.move(move);
	let new_fen = chess.fen();
	
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const update_res = await client.query(update, [new_fen, sender_id]);
	console.log('New fen: ' + update_res.rows[0].fen);
	
	await client.end();
	return outputBoard(chess.board());
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
			let message = webhook_event.message.text;
			console.log('Sender PSID: ' + sender_psid);
			
			makeMove(sender_psid, message)
				.then(board => {
					console.log(board);
					
					let message_body = {
						messaging_type: "RESPONSE",
						recipient: {
							id: sender_psid
						},
						message: {
							text: board
						}
					}
					
					postData(messageUrl, message_body)
						.then(data => {
							console.log(data); // JSON data parsed by `data.json()` call
						});
				})
				.catch(e => console.log(e));
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