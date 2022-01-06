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

var Stockfish;
var engine;
var INIT_ENGINE = require("stockfish");

const messageUrl = 'https://graph.facebook.com/v12.0/me/messages?' + new URLSearchParams({access_token: process.env.PAGE_ACCESS_TOKEN})

const symbols = {
	pieces: {
		w: {
			p: "🐣",
			n: "🦄",
			b: "🏃",
			r: "🏰",
			q: "👸",
			k: "🤴"
		},
		b: {
			p: "♟",
			n: "🐴",
			b: "🕴",
			r: "🗿",
			q: "👩‍✈️",
			k: "🤵"
		}
	},
	board: {
		rank: ["8️⃣", "7️⃣", "6️⃣", "5️⃣", "4️⃣", "3️⃣", "2️⃣", "1️⃣"],
		file: ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭"],
		lightTile: "◽",
		darkTile: "◾",
		origin: "🏁",
		zeroWidth: "​"
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
		let xAxis = symbols.board.origin + symbols.board.file.join(symbols.board.zeroWidth); // Add file indicators
		output += "\n" + xAxis;
	} else {
		let xAxis = symbols.board.origin + symbols.board.file.slice().reverse().join(symbols.board.zeroWidth); // Add file indicators
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

function sendResponse(senderId, message, quickReplies = null) {
	let messageBody = {
		messaging_type: "RESPONSE",
		recipient: {
			id: senderId
		},
		message: {
			text: message
		}
	}
	
	if (quickReplies !== null) {
		messageBody.message.quick_replies = quickReplies;
	}
	
	postData(messageUrl, messageBody)
		.then(data => {
			console.log(data); // JSON data parsed by `data.json()` call
		});
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

async function newGame(senderId) {
	// Connect to the PostgreSQL database
	const client = await createClient();
	
	const chess = new Chess();
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [chess.fen(), senderId]);
	console.log('Started new game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return {fen: chess.fen(), board: outputBoard(chess.board())};
}

async function makeMove(senderId, move) {
	const client = await createClient();
	
	let fen;
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	fen = selectRes.rows[0].fen;
	console.log('Old fen: ' + fen);
	
	const chess = new Chess(fen);
	let moveResult = chess.move(move);
	let newFen = chess.fen();
	
	if (moveResult != null) {
		// moveResult is null if the input move is invalid
		const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
		const updateRes = await client.query(update, [newFen, senderId]);
		console.log('New fen: ' + updateRes.rows[0].fen);
	}
	
	await client.end();
	return {valid: moveResult != null, fen: newFen, board: outputBoard(chess.board())};
}

var isEngineRunning = false;
var engineProcessingSenderId;

function startEngineMove(fen, senderId) {
	if (!isEngineRunning) {
		engine.postMessage("position fen " + fen);
		engine.postMessage("go depth 3");
		isEngineRunning = true;
		engineProcessingSenderId = senderId;
		return true;
	} else {
		// Engine currently analysing previous command
		return false;
	}
}

async function postEngineMove(engineMove) {
	if (isEngineRunning) {
		await new Promise(r => setTimeout(r, 200));
		
		makeMove(engineProcessingSenderId, engineMove)
			.then(result => {
				if (result.valid) {
					console.log(result.board);
					sendResponse(engineProcessingSenderId, "Bot: \n" + result.board);
				} else {
					console.log("Unexpected error with engineMove " + engineMove)
					sendResponse(engineProcessingSenderId, "Error detected *beep boop*");
				}
				
				isEngineRunning = false;
				engineProcessingSenderId = null;
			})
			.catch(e => console.log(e));
		return true;
	} else {
		return false;
	}
}

function chatController(message, senderId) {
	switch(message.toLowerCase()) {
		case 'new game':
			newGame(sender_psid)
			.then(result => {
				sendResponse(sender_psid, "New game:\n" + result.board);
			})
			.catch(e => console.log(e));
			break;
		case 'test':
			let quickReply = [{ content_type:"text", title:"♟(pawn)", payload:"Test" }];
			sendResponse(sender_psid, "Test", quickReply);
		default:
			makeMove(sender_psid, message)
			.then(result => {
				if (result.valid) {
					console.log(result.board);
					sendResponse(sender_psid, "You:\n" + result.board);
					
					startEngineMove(result.fen, sender_psid)
				} else {
					console.log("Input move is invalid: " + message);
					sendResponse(sender_psid, "Invalid move");
				}
			})
			.catch(e => console.log(e));
	}
}

// ----------
// START
// Initialise chess engine, register app listen, and create endpoints
// ----------

var wasmPath = require.resolve("stockfish/src/stockfish.wasm");
var mod = {
	locateFile: function (path)
	{
		if (path.indexOf(".wasm") > -1) {
			/// Set the path to the wasm binary.
			return wasmPath;
		} else {
			/// Set path to worker (self + the worker hash)
			return __filename;
		}
	},
};

if (typeof INIT_ENGINE === "function") {
	var Stockfish = INIT_ENGINE();
	try {
		Stockfish(mod).then(function (sf)
		{
			engine = sf;
			startEngine();
		});
	} catch (e) {
		console.error(e);
	}
}

function startEngine() {
	function send(str) {
		console.log("Sending: " + str)
		engine.postMessage(str);
	}

	engine.addMessageListener(function onLog(line)
    {
        console.log("Line: " + line)
		
		if (line.indexOf("uciok") > -1) {
			// Sets server port and logs message on success
			app.listen(process.env.PORT || 80, () => console.log('webhook is listening on port ' + String(process.env.PORT)));
		} else if (line.indexOf("bestmove") > -1) {
			let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
			if (match) {
				postEngineMove({from: match[1], to: match[2], promotion: match[3]});
			}
		}
	});

	send("uci");
	send("setoption name Skill Level value 0");
	send("d");
}

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {	
 
	let body = req.body;

	// Checks this is an event from a page subscription
	if (body.object === 'page') {
	
		// Iterates over each entry - there may be multiple if batched
		body.entry.forEach(function(entry) {
			try {
				// Gets the message. entry.messaging is an array, but 
				// will only ever contain one message, so we get index 0
				let webhook_event = entry.messaging[0];
				console.log(webhook_event);
			
				let sender_psid = webhook_event.sender.id;
				let message = webhook_event.message.text;
				chatController(message, sender_psid);
			} catch(e) {
				console.error(e);
			}
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
