'use strict';

// Imports dependencies and set up http server
const
	express = require('express'),
	fetch = require('node-fetch'),
	ChatInterface = require('./chatInterface.js'),
	EmojiChess = require('./emojiChess.js'),
	Bot = require('./bot.js'),
	Menu = require('./menu.js'),
	bodyParser = require('body-parser'),
	app = express().use(bodyParser.json()); // creates express http server

const { Client } = require('pg');
const { URLSearchParams } = require('url');
const { Chess } = require('chess.js');
const chatInterface = new ChatInterface('https://graph.facebook.com/v12.0/me/messages?', process.env.PAGE_ACCESS_TOKEN);
var bot;

const statusCheck = "Check";
const statusCheckmate = "Checkmate";
const statusDraw = "Draw";
const statusStalemate = "Stalemate";
const statusRepetition = "Threefold Repetition";
const statusMaterial = "Insufficient Material";

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

async function newGame(senderId, level) {
	// Connect to the PostgreSQL database
	const client = await createClient();
	
	// TO DO: Check for existence of game for senderId
	const chess = new Chess();
	const availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
	
	const update = 'UPDATE games SET fen = $1, level = $2 WHERE sender_id = $3 RETURNING *;'
	const updateRes = await client.query(update, [chess.fen(), level, senderId]);
	console.log('Started new game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return {fen: chess.fen(), board: EmojiChess.outputBoard(chess.board(), null), availableMoves: availableMoves};
}

async function loadGame(senderId, fen) {
	// WARNING: DEBUG ONLY
	// Prone to SQL injection
	
	// Connect to the PostgreSQL database
	const client = await createClient();
	
	const chess = new Chess(fen);
	const availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
	
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [chess.fen(), senderId]);
	console.log('Started new game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return {fen: chess.fen(), board: EmojiChess.outputBoard(chess.board(), null), availableMoves: availableMoves};
}

async function loadAvailableMoves(senderId) {
	const client = await createClient();
	
	let fen;
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	fen = selectRes.rows[0].fen;
	
	const chess = new Chess(fen);
	return EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
}

async function makeMove(senderId, move, replyAvailableMoves = true) {
	const client = await createClient();
	
	let fen;
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	fen = selectRes.rows[0].fen;
	console.log('Old fen: ' + fen);
	
	const chess = new Chess(fen);
	let moveResult = chess.move(move);
	if (moveResult == null) {
		// moveResult is null if the input move is invalid
		return {move: moveResult};
	}
	
	let newFen = chess.fen();
	let gameOver = chess.game_over();
	let status = null;
	let availableMoves = null;
	if (gameOver) {
		// Game that is in_checkmate is also in_check, therefore call in_checkmate() first
		if (chess.in_checkmate()) {
			status = statusCheckmate;
		} else if (chess.in_draw()) {
			status = statusDraw;
		} else if (chess.in_stalemate()) {
			status = statusStalemate;
		} else if (chess.in_threefold_repetition()) {
			// TO DO: Cannot detect threefold repetition when calling FEN from scratch
			status = statusRepetition;
		} else if (chess.insufficient_material()) {
			status = statusMaterial;
		}
	} else {
		if (chess.in_check()) {
			status = statusCheck;
		}
		
		if (replyAvailableMoves) {
			availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
		}
	}
	
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [newFen, senderId]);
	console.log('New fen: ' + updateRes.rows[0].fen);
	
	await client.end();
	return {move: moveResult, fen: newFen, board: EmojiChess.outputBoard(chess.board(), moveResult.from), gameOver: gameOver, status: status, availableMoves: availableMoves};
}

async function getBoard(senderId, isWhitePov = true) {
	const client = await createClient();
	
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	
	let fen = selectRes.rows[0].fen;
	const chess = new Chess(fen);
	await client.end();
	
	return EmojiChess.outputBoard(chess.board(), null, isWhitePov);
}

async function getEngineLevel(senderId) {
	const client = await createClient();
	
	const select = 'SELECT level FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	let level = selectRes.rows[0].level;
	await client.end();
	
	return level;
}

function playPlayerMove(senderId, move) {
	makeMove(senderId, move, false)
	.then(position => {
		if (position.move != null) {
			console.log(position.board);
			chatInterface.sendResponse(senderId, "Your move: " + move + "\n\nMove X\n" + position.board, 0);
			
			if (position.gameOver) {
				chatInterface.sendResponse(senderId, "Game over! " + position.status, 0);
			} else {
				getEngineLevel(senderId)
				.then(level => {
					bot.startEngineMove(position.fen, senderId, level);
				});
			}
		} else {
			console.log("Input move is invalid: " + move);
			chatInterface.sendResponse(senderId, "Invalid move", 0);
		}
	})
	.catch(e => console.log(e));
}

function chatController(message, senderId, payload = null) {
	if (payload != null) {
		if (payload.split('|').length > 1) {
			let encoded = payload.split('|');
			switch(encoded[0]) {
				case 'Move':
					playPlayerMove(senderId, encoded[1]);
					break;
				case 'Tree':
					let nextPayload = EmojiChess.decodeTree(encoded);
					chatInterface.sendResponse(senderId, "Options:", 0, nextPayload);
					break;
				default:
					console.error("ERROR - Unknown payload: " + payload);
			}
		} else {
			switch(payload) {
				case Bot.botLevel[0].payload:
				case Bot.botLevel[1].payload:
				case Bot.botLevel[2].payload:
				case Bot.botLevel[3].payload:
				case Bot.botLevel[4].payload:
				case Bot.botLevel[5].payload:
				case Bot.botLevel[6].payload:
				case Bot.botLevel[7].payload:
					let level;
					for (let i = 0; i < Bot.botLevel.length; i++) {
						if (payload == Bot.botLevel[i].payload) {
							level = i;
							break;
						}
					}
					
					newGame(senderId, level)
					.then(position => {
						chatInterface.sendResponse(senderId, "New game:\n" + position.board, 0)
						.then(r => {
							chatInterface.sendResponse(senderId, position.availableMoves.message, 1500, position.availableMoves.replies);
						});
					})
					.catch(e => console.log(e));
					break;
				case EmojiChess.getAvailableMovesPayload:
					loadAvailableMoves(senderId)
					.then(availableMoves => {
						chatInterface.sendResponse(senderId, "Options:", 0, availableMoves.replies);
					});
					break;
				case 'Menu':
					chatInterface.sendResponse(senderId, "Menu", 0, Menu.getMenuPayload());
					break;
				default:
					console.error("ERROR - Unknown payload: " + payload);
			}
		}
	} else if (message.slice(0, 11) == 'debug load ') {
		// DEBUG ONLY
		loadGame(senderId, message.slice(11))
		.then(position => {
			chatInterface.sendResponse(senderId, "Loaded custom position:\n" + position.board, 0)
			.then(r => {
				chatInterface.sendResponse(senderId, position.availableMoves.message, 1500, position.availableMoves.replies)
			});
		})
		.catch(e => console.log(e));
	} else {
		switch(message.toLowerCase()) {
			case 'new game':
				let quickReply = [];
				Object.entries(Bot.botLevel).forEach(([key, val]) => {
					quickReply.push({ content_type: "text", title: val.emoji, payload: val.payload })
				});
				chatInterface.sendResponse(senderId, "Starting a new game...", 0)
				.then(r => chatInterface.sendResponse(senderId, "Choose your opponent:", 1000, quickReply));
				break;
			case 'white':
				getBoard(senderId, true)
				.then(board => {
					chatInterface.sendResponse(senderId, "White POV\n" + board, 0);
				});
				break;
			case 'black':
				getBoard(senderId, false)
				.then(board => {
					chatInterface.sendResponse(senderId, "Black POV\n" + board, 0);
				});
				break;
			default:
				playPlayerMove(senderId, message);
		}
	}
}

function engineOkCallback() {
	app.listen(process.env.PORT || 80, () => console.log('webhook is listening on port ' + String(process.env.PORT)));
}

// ----------
// START
// Initialise chess engine, register app listen, and create endpoints
// ----------

var Stockfish;
var INIT_ENGINE = require("stockfish");

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
			bot = new Bot(sf, chatInterface, engineOkCallback, makeMove);
			bot.startEngine(); // Register app listen
		});
	} catch (e) {
		console.error(e);
	}
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
				let payload;
				if (webhook_event.message.quick_reply) {
					payload = webhook_event.message.quick_reply.payload;
				}
				chatController(message, sender_psid, payload);
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
