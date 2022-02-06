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

const statusNotStarted = "Not Started";
const statusInProgress = "In Progress";
const statusWhiteWon = "White Won";
const statusBlackWon = "Black Won";
const statusAbandoned = "Abandoned";
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
	// `level`: integer corresponding to the index of Bot.botLevel
	// Transfer previous game (if any) into the `games_archive` table,
	// delete old records from the `games` table,
	// and insert a new "blank" record with just the bot level
	
	const client = await createClient();
	
	// Archive previous game that are not "blank" entries
	// A record may be "blank" if it was created but the game was never started
	const transfer = 'INSERT INTO games_archive SELECT sender_id, fen, level, status, is_player_white, created_on FROM games WHERE sender_id = $1 AND fen IS NOT NULL;'
	const transferRes = await client.query(transfer, [senderId]);
	
	// Delete old game(s) from the `game` table including any "blank" entries
	const deleteQuery = 'DELETE FROM games WHERE sender_id = $1;'
	const deleteRes = await client.query(deleteQuery, [senderId]);
	
	const update = 'INSERT INTO games (sender_id, level, status) VALUES ($1, $2, $3) RETURNING *;'
	const updateRes = await client.query(update, [senderId, level, statusNotStarted]);
	console.log('Created new game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return true;
}

async function startGame(senderId, isWhitePov) {
	const client = await createClient();
	const chess = new Chess();
	const isBotsTurn = !isWhitePov;
	
	const update = 'UPDATE games SET fen = $1, status = $2, is_player_white = $3, is_white_pov = $3, is_bots_turn = $4 WHERE sender_id = $5';
	const updateRes = await client.query(update, [chess.fen(), statusInProgress, isWhitePov, isBotsTurn, senderId]);
	
	const availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
	return {fen: chess.fen(), board: EmojiChess.outputBoard(chess.board(), null, isWhitePov), availableMoves: availableMoves};
}

async function loadGame(senderId, fen) {
	// WARNING: DEBUG ONLY
	// Prone to SQL injection
	const client = await createClient();
	
	const chess = new Chess(fen);
	const availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
	
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [chess.fen(), senderId]);
	console.log('Loaded custom game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return {fen: chess.fen(), board: EmojiChess.outputBoard(chess.board(), null), availableMoves: availableMoves};
}

async function flipViewPerspective(senderId) {
	const client = await createClient();
	
	const select = 'SELECT fen, is_white_pov FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	const fen = selectRes.rows[0].fen;
	const isWhitePov = selectRes.rows[0].is_white_pov;
	const newIsWhitePov = !isWhitePov;
	
	const update = 'UPDATE games SET is_white_pov = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [newIsWhitePov, senderId]);
	
	const chess = new Chess(fen);
	const availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
	
	await client.end();
	return {fen: chess.fen(), board: EmojiChess.outputBoard(chess.board(), null, newIsWhitePov), availableMoves: availableMoves};
}

async function loadAvailableMoves(senderId) {
	const client = await createClient();
	
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	const fen = selectRes.rows[0].fen;
	
	const chess = new Chess(fen);
	return EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
}

async function makeMove(senderId, move, replyAvailableMoves = true) {
	const client = await createClient();
	
	const select = 'SELECT fen, is_white_pov FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	const fen = selectRes.rows[0].fen;
	const isWhitePov = selectRes.rows[0].is_white_pov;
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
		} else if (chess.insufficient_material()) {
			status = statusMaterial;
		} else if (chess.in_draw()) {
			// Draw due to 50-move rule (or insufficient material, but already caught above)
			status = statusDraw;
		} else if (chess.in_stalemate()) {
			status = statusStalemate;
		} else if (chess.in_threefold_repetition()) {
			// TO DO: Cannot detect threefold repetition when calling FEN from scratch
			status = statusRepetition;
		}
		
		// If checkmate, differentiate between white/black win when recording status to database
		let gameStatus = status;
		if (gameStatus === statusCheckmate) {
			gameStatus = (moveResult.color === 'w') ? statusWhiteWon : statusBlackWon;
		}
		
		let update = 'UPDATE games SET fen = $1, status = $2 WHERE sender_id = $3 RETURNING *;'
		let updateRes = await client.query(update, [newFen, gameStatus, senderId]);
	} else {
		if (chess.in_check()) {
			status = statusCheck;
		}
		
		if (replyAvailableMoves) {
			availableMoves = EmojiChess.getAvailableMoves(chess.moves({ verbose: true }));
		}
		
		let update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
		let updateRes = await client.query(update, [newFen, senderId]);
	}
	

	console.log('New fen: ' + newFen);
	
	await client.end();
	return {move: moveResult, fen: newFen, board: EmojiChess.outputBoard(chess.board(), moveResult.from, isWhitePov), gameOver: gameOver, status: status, availableMoves: availableMoves};
}

async function getPosition(senderId, isWhitePov = true) {
	const client = await createClient();
	
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	
	let fen = selectRes.rows[0].fen;
	const chess = new Chess(fen);
	await client.end();
	
	return {fen: fen, board: EmojiChess.outputBoard(chess.board(), null, isWhitePov)};
}

async function getEngineLevel(senderId) {
	const client = await createClient();
	
	const select = 'SELECT level FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	const level = selectRes.rows[0].level;
	await client.end();
	
	return level;
}

async function getGameStatus(senderId) {
	const client = await createClient();
	
	const select = 'SELECT status FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	const status = selectRes.rows[0].status;
	await client.end();
	
	return status;
}

async function updateGameStatus(senderId, status) {
	const client = await createClient();
	
	const update = 'UPDATE games SET status = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [status, senderId]);
	await client.end();
	
	return updateRes.rowCount;
}

function processStartNewGame(senderId) {
	getGameStatus(senderId)
	.then(status => {
		if (status === statusInProgress) {
			const confirmPayload = [{ content_type: "text", title: EmojiChess.symbols.menu.yes + " Yes", payload: "Confirm New Game" },
				{ content_type: "text", title: EmojiChess.symbols.menu.no + " No", payload: EmojiChess.plGetAvailableMoves }];
			chatInterface.sendResponse(senderId, "Confirm start a new game?", 1000, confirmPayload)
		} else {
			processShowLevelSelect(senderId);
		}
	});
}

function processConfirmNewGame(senderId) {
	updateGameStatus(senderId, statusAbandoned)
	.then(r => {
		console.log("DEBUG: " + String(r));
		processShowLevelSelect(senderId);
	});
}

function processShowLevelSelect(senderId) {
	let botPayload = [];
	Object.entries(Bot.botLevel).forEach(([key, val]) => {
		botPayload.push({ content_type: "text", title: val.emoji, payload: val.payload })
	});
	chatInterface.sendResponse(senderId, "Starting a new game...", 0)
	.then(r => chatInterface.sendResponse(senderId, "Choose your opponent:", 1000, botPayload));
}

function processLevelSelected(senderId, level) {
	newGame(senderId, level);
	
	const colorPayload = [{ content_type: "text", title: EmojiChess.symbols.pieces.w.k + " White", payload: "Color|w" },
		{ content_type: "text", title: EmojiChess.symbols.menu.randomColor + " Random", payload: "Color|r" },
		{ content_type: "text", title: EmojiChess.symbols.pieces.b.k + " Black", payload: "Color|b" }];
	chatInterface.sendResponse(senderId, "Pick a color:", 0, colorPayload);
}

function processColorSelected(senderId, color) {
	let isWhitePov = (color === 'w');
	if (color === 'r') {
		isWhitePov = (Math.random() < 0.5);
	}
	
	startGame(senderId, isWhitePov)
	.then(position => {
		chatInterface.sendResponse(senderId, "New game:\n" + position.board, 0);
		return position;
	})
	.then(position => {
		if (isWhitePov) {
			chatInterface.sendResponse(senderId, position.availableMoves.message, 1500, position.availableMoves.replies);
		} else {
			getEngineLevel(senderId)
			.then(engineLevel => {
				bot.startEngineMove(position.fen, senderId, engineLevel);
			});
		}
	})
	.catch(e => console.log(e));
}

function processPlayerMove(senderId, move) {
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

function processMenuOptions(senderId, optionPayload) {
	switch(optionPayload) {
		case EmojiChess.plMenuRoot:
			chatInterface.sendResponse(senderId, "Menu", 0, Menu.getMenuRootPayload());
			break;
		case Menu.plNewGame:
			processStartNewGame(senderId);
			break;
		case Menu.plFlipBoard:
			flipViewPerspective(senderId)
			.then(position => {
				chatInterface.sendResponse(senderId, "Move X\n" + position.board, 0);
				return position;
			})
			.then(position => {
				chatInterface.sendResponse(senderId, position.availableMoves.message, 1500, position.availableMoves.replies);
			});
			break;
		case Menu.plDownloadGame:
			const downloadPayload = [{ content_type: "text", title: EmojiChess.symbols.menu.fen + " Download FEN", payload: "Menu|" + Menu.plDownloadFen },
			{ content_type: "text", title: EmojiChess.symbols.menu.pgn + " Download PGN", payload: "Menu|" + Menu.plDownloadPgn }];
			chatInterface.sendResponse(senderId, "Choose a format:", 0, downloadPayload);
			break;
		case Menu.plDownloadFen:
			getPosition(senderId)
			.then(position => { chatInterface.sendResponse(senderId, position.fen, 0); });
			break;
		case Menu.plHelpMenu:
			chatInterface.sendResponse(senderId, "Help", 0, Menu.getHelpMenuPayload());
			break;
		case Menu.plPlayingMove:
			const playingMoveMessage = "Just type a move lol 4Head";
			chatInterface.sendResponse(senderId, playingMoveMessage, 0, Menu.getHelpMenuPayload());
			break;
		default:
			console.log("ERROR - Unknown payload at processMenuOptions: " + optionPayload);
	}
	
	const plPlayingMove = 'playing_move';
	const plOtherCommands = 'other_commands';
	const plChessRules = 'chess_rules';
	const plAbout = 'about';
	const plDownloadPgn = 'download_pgn';
}

function chatController(message, senderId, payload = null) {
	if (payload != null) {
		const splitPayload = payload.split('|');
		switch(splitPayload[0]) {
			case 'Confirm New Game':
				processConfirmNewGame(senderId);
				break;
			case 'Level':
				const level = splitPayload[1];
				processLevelSelected(senderId, level)
				break;
			case 'Color':
				const color = splitPayload[1];
				processColorSelected(senderId, color)
				break;
			case 'Move':
				processPlayerMove(senderId, splitPayload[1]);
				break;
			case 'Tree':
				let nextPayload = EmojiChess.decodeTree(splitPayload);
				chatInterface.sendResponse(senderId, "Options:", 0, nextPayload);
				break;
			case EmojiChess.plGetAvailableMoves:
				loadAvailableMoves(senderId)
				.then(availableMoves => {
					chatInterface.sendResponse(senderId, "Options:", 0, availableMoves.replies);
				});
				break;
			case 'Menu':
				processMenuOptions(senderId, splitPayload[1]);
				break;
			default:
				console.error("ERROR - Unknown payload: " + payload);
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
				processStartNewGame(senderId);
				break;
			case 'white':
				getPosition(senderId, true)
				.then(position => { chatInterface.sendResponse(senderId, "White POV\n" + position.board, 0); });
				break;
			case 'black':
				getPosition(senderId, false)
				.then(position => { chatInterface.sendResponse(senderId, "Black POV\n" + position.board, 0); });
				break;
			case 'menu':
				processMenuOptions(senderId, EmojiChess.plMenuRoot);
				break;
			default:
				processPlayerMove(senderId, message);
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
