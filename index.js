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
			b: "🐘",
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
		activeLightTile: "🔲",
		activeDarkTile: "🔳",
		origin: "🏁",
		zeroWidth: "​"
	}
}

const botLevel = [
	{ emoji: '👶', payload: 'level_0', depth: 1, skill: 0},
	{ emoji: '👧', payload: 'level_1', depth: 2, skill: 1},
	{ emoji: '🤓', payload: 'level_2', depth: 5, skill: 5},
	{ emoji: '👨‍🦳', payload: 'level_3', depth: 8, skill: 10},
	{ emoji: '🧙‍♂️', payload: 'level_4', depth: 12, skill: 15},
	{ emoji: '👽', payload: 'level_5', depth: 18, skill: 20}
]

const statusCheck = "Check";
const statusCheckmate = "Checkmate";
const statusDraw = "Draw";
const statusStalemate = "Stalemate";
const statusRepetition = "Threefold Repetition";
const statusMaterial = "Insufficient Material";

function outputBoard(board, from, isWhitePov = true) {
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
		rows.push(row);
	}
		
	// Replace the tile that a piece moved `from` in the previous turn into an "active" tile
	if (from != null) {
		let file = from.charCodeAt(0) - 97; // charCodeAt(n) gives the codepoint of the nth character in the string; lowercase a is 97
		let rank = parseInt(from.charAt(1));
		if (isNaN(rank) || file < 0 || file > 7) { throw 'Unexpected format of "from" parameter'; }
		rows[8-rank][file] = (rows[8-rank][file] == symbols.board.darkTile) ? symbols.board.activeDarkTile : symbols.board.activeLightTile;
	}
	
	// Add rank number and file indicators
	if (isWhitePov) {
		for (let i = 0; i < 8; i++) {
			rows[i].unshift(symbols.board.rank[i]); // Rank number indicators
			rows[i] = rows[i].join("");
		}
		let xAxis = symbols.board.origin + symbols.board.file.join(symbols.board.zeroWidth); // File indicators
		rows.push(xAxis);
	} else {
		// From black's perspective, horizontally mirror rows and build board from bottom up
		let newRows = [];
		for (let i = 0; i < 8; i++) {
			rows[i].reverse();
			rows[i].unshift(symbols.board.rank[i]); // Rank number indicators
			newRows.unshift(rows[i].join(""));
		}
		rows = newRows;
		let xAxis = symbols.board.origin + symbols.board.file.slice().reverse().join(symbols.board.zeroWidth); // File indicators
		rows.push(xAxis);
	}
	
	return rows.join("\n");
}

function formatMove(move, piece, color) {
	// Formats a SAN move to replace the piece letter with its emoji
	// Except for pawn moves and castling
	// e.g. Nf3 -> 🦄f3
	if (piece == 'p' || move.charAt(0) == 'O') {
		return move;
	} else {
		return symbols.pieces[color][piece] + move.slice(1);
	}
}

function encodeMoves(moves) {
	// Divides up available moves for a particular piece (knight, bishop, etc.) into a tree
	// Where each layer of the tree has no more than 12 nodes
	// Returns a payload that can be decoded and used as the quick reply payload
	
	// Example tree 1 (one layer):
	// Knights at starting position for white
	// ['Na3', 'Nc3', 'Nf3', 'Nh3']
	
	// Example tree 2 (two layers):
	// Rook on a1 with an otherwise empty board
	// [{'a-file': ['Ra2', 'Ra3', 'Ra4', 'Ra5', 'Ra6', 'Ra7', 'Ra8']}, 'Rb1', 'Rc1', 'Rd1', 'Re1', 'Rf1', 'Rg1', 'Rh1']
	
	// Example tree 3 (three layers):
	// Rooks on a1 and c1 with an otherwise empty board
	// [{'R on a1': ['Ra2', 'Ra3', 'Ra4', 'Ra5', 'Ra6', 'Ra7', 'Ra8', 'Rab1']},
	//	{'R on c1': ['Rcb1', {'c-file': ['Rc2', 'Rc3', 'Rc4', 'Rc5', 'Rc6', 'Rc7', 'Rc8']}, 'Rd1', 'Re1', 'Rf1', 'Rg1', 'Rh1']}]
	
	if (moves.constructor.name !== 'Array' || moves.length === 0) {
		throw 'Invalid argument `moves` in encodeMoves()';
	}
	
	function sanitiseMove(move) {
		// Remove the check (+) and checkmate (#) markers on move notation
		// So that they do not provide hints when displaying possible moves
		return move.replace('+', '').replace('#', '');
	}
	
	function splitByFile(pieceMoves) {
		let files = {};
		for (const move of pieceMoves) {
			const file = move.to.charAt(0);
			if (files.hasOwnProperty(file)) {
				files[file].push(sanitiseMove(move.san));
			} else {
				files[file] = [sanitiseMove(move.san)];
			}
		}
		
		let pieceTree = [];
		for (const file in files) {
			if (files[file].length == 1) {
				pieceTree.push(files[file][0]);
			} else {
				const fileName = `${file}-file`;
				pieceTree.push({ [fileName]: files[file] });
			}
		}
		
		return pieceTree;
	}
	
	let color = moves[0].color;
	let piece = moves[0].piece;
	let pieceEmoji = symbols.pieces[color][piece];
	
	let payload = [];
	if (moves.length <= 12) {
		payload = moves.map(move => sanitiseMove(move.san));
	} else {
		// Is there more than one instance of this piece on the board? (e.g. 2 knights, 2 bishops)
		// If so, separate moves based on piece instance and analyse individually
		// There cannot be more than 10 instances of a piece when playing regular chess:
		// e.g. all 8 pawns promoted to knights + 2 starting knights = 10 instances of knights
		let origins = new Set();
		for (const move of moves) { origins.add(move.from); }
		if (origins.size > 12) {
			throw 'Unexpectedly large number of piece instances: ' + String(origins.size);
		} else if (origins.size > 1) {
			let pieceInstances = {};
			origins.forEach((from) => pieceInstances[from] = []);
			for (const move of moves) { pieceInstances[move.from].push(move); }
			for (const from in pieceInstances) {
				if (pieceInstances[from].length == 1) {
					// Only a single legal move for this piece instance,
					// so display the available move and don't branch further
					payload.push(sanitiseMove(pieceInstances[from][0].san));
				} else if (pieceInstances[from].length <= 12) {
					// Since there are 12 or fewer legal moves for this piece instance,
					// next quick reply can display all moves
					let optionName = `${pieceEmoji} on ${from}`;
					payload.push({ [optionName]: pieceInstances[from].map(move => sanitiseMove(move.san)) });
				} else {
					// More than 12 legal moves for this piece instance
					// Further split the destinations by files
					let pieceTree = splitByFile(pieceInstances[from]);
					let optionName = `${pieceEmoji} on ${from}`;
					payload.push({ [optionName]: pieceTree });
				}
			}
		} else {
			// Only a single piece but it has more than 12 legal moves
			// Further split the destinations by files
			payload = splitByFile(moves);
		}
	}
	
	return payload;
}

function getAvailableMoves(moves) {
	if (moves.length == 0) {
		throw 'No available moves supplied';
	}
	
	let quickReplies = [];
	let isWhitesTurn = ( moves[0].color == 'w' )
	
	if (moves.length <= 12) {
		for (const move of moves) {
			quickReplies.push({ content_type: "text", title: formatMove(move.san, move.piece, move.color), payload: "Move|" + move.san });
		}
		return { message: 'Your turn! Pick a move:', replies: quickReplies };
	}
	
	let pawnMoves = [];
	let knightMoves = [];
	let bishopMoves = [];
	let rookMoves = [];
	let queenMoves = [];
	let kingMoves = [];
	
	for (const move of moves) {
		switch (move.piece) {
			case "n":
				knightMoves.push(move);
				break;
			case "b":
				bishopMoves.push(move);
				break;
			case "r":
				rookMoves.push(move);
				break;
			case "q":
				queenMoves.push(move);
				break;
			case "k":
				kingMoves.push(move);
				break;
			case "p":
				pawnMoves.push(move);
				break;
			default:
				throw 'Unknown move with piece ' + move.piece;
		}
	}
	
	if (pawnMoves.length > 0) {
		let titleP = isWhitesTurn ? symbols.pieces.w.p : symbols.pieces.b.p;
		titleP += " (Pawn)";
		let payloadP = "Tree|" + JSON.stringify(encodeMoves(pawnMoves));
		quickReplies.push({content_type: "text", title: titleP, payload: payloadP});
	}
	
	if (knightMoves.length > 0) {
		let titleN = isWhitesTurn ? symbols.pieces.w.n : symbols.pieces.b.n;
		titleN += " (Knight)";
		let payloadN = "Tree|" + JSON.stringify(encodeMoves(knightMoves));
		quickReplies.push({content_type: "text", title: titleN, payload: payloadN});
	}
	
	if (bishopMoves.length > 0) {
		let titleB = isWhitesTurn ? symbols.pieces.w.b : symbols.pieces.b.b;
		titleB += " (Bishop)";
		let payloadB = "Tree|" + JSON.stringify(encodeMoves(bishopMoves));
		quickReplies.push({content_type: "text", title: titleB, payload: payloadB});
	}
	
	if (rookMoves.length > 0) {
		let titleR = isWhitesTurn ? symbols.pieces.w.r : symbols.pieces.b.r;
		titleR += " (Rook)";
		let payloadR = "Tree|" + JSON.stringify(encodeMoves(rookMoves));
		quickReplies.push({content_type: "text", title: titleR, payload: payloadR});
	}
	
	if (queenMoves.length > 0) {
		let titleQ = isWhitesTurn ? symbols.pieces.w.q : symbols.pieces.b.q;
		titleQ += " (Queen)";
		let payloadQ = "Tree|" + JSON.stringify(encodeMoves(queenMoves));
		quickReplies.push({content_type: "text", title: titleQ, payload: payloadQ});
	}
	
	if (kingMoves.length > 0) {
		let titleK = isWhitesTurn ? symbols.pieces.w.k : symbols.pieces.b.k;
		titleK += " (King)";
		let payloadK = "Tree|" + JSON.stringify(encodeMoves(kingMoves));
		quickReplies.push({content_type: "text", title: titleK, payload: payloadK});
	}
	
	return { message: 'Your turn! Pick a piece:', replies: quickReplies };
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

async function typingOn(senderId) {
	let body = {
		recipient: {
			id: senderId
		},
		sender_action: "typing_on"
	};
	
	let response = await postData(messageUrl, body);
	return response;
}

async function sendResponse(senderId, message, sendDelay, quickReplies = null) {
	if (sendDelay && sendDelay > 0) {
		// Turn on typing indicator and add a short delay so that messages feel like they're being typed out
		typingOn(senderId);
		await new Promise(r => setTimeout(r, sendDelay));
	}
	
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
	
	return true;
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

async function newGame(senderId, level) {
	// Connect to the PostgreSQL database
	const client = await createClient();
	
	// TO DO: Check for existence of game for senderId
	const chess = new Chess();
	const update = 'UPDATE games SET fen = $1, level = $2 WHERE sender_id = $3 RETURNING *;'
	const updateRes = await client.query(update, [chess.fen(), level, senderId]);
	console.log('Started new game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return {fen: chess.fen(), board: outputBoard(chess.board(), null)};
}

async function loadGame(senderId, fen) {
	// WARNING: DEBUG ONLY
	// Prone to SQL injection
	
	// Connect to the PostgreSQL database
	const client = await createClient();
	
	const chess = new Chess(fen);
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [chess.fen(), senderId]);
	console.log('Started new game for user ' + updateRes.rows[0].sender_id);
	
	await client.end();
	return {fen: chess.fen(), board: outputBoard(chess.board(), null)};
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
			console.log(chess.moves());
			availableMoves = getAvailableMoves(chess.moves({ verbose: true }));
		}
	}
	
	const update = 'UPDATE games SET fen = $1 WHERE sender_id = $2 RETURNING *;'
	const updateRes = await client.query(update, [newFen, senderId]);
	console.log('New fen: ' + updateRes.rows[0].fen);
	
	await client.end();
	return {move: moveResult, fen: newFen, board: outputBoard(chess.board(), moveResult.from), gameOver: gameOver, status: status, availableMoves: availableMoves};
}

async function getBoard(senderId, isWhitePov = true) {
	const client = await createClient();
	
	const select = 'SELECT fen FROM games WHERE sender_id = $1;'
	const selectRes = await client.query(select, [senderId]);
	
	let fen = selectRes.rows[0].fen;
	const chess = new Chess(fen);
	await client.end();
	
	return outputBoard(chess.board(), null, isWhitePov);
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
			sendResponse(senderId, "Your move: " + move + "\n\nMove X\n" + position.board, 0);
			
			if (position.gameOver) {
				sendResponse(senderId, "Game over! " + position.status, 0);
			} else {
				getEngineLevel(senderId)
				.then(level => {
					startEngineMove(position.fen, senderId, level);
				});
			}
		} else {
			console.log("Input move is invalid: " + move);
			sendResponse(senderId, "Invalid move", 0);
		}
	})
	.catch(e => console.log(e));
}

var isEngineRunning = false;
var engineProcessingSenderId;
var engineCurrentLevel;

function startEngineMove(fen, senderId, level) {
	if (!isEngineRunning) {
		let depth = botLevel[level].depth;
		let skillLevel = botLevel[level].skill;
		console.log(`Evaluating position [${fen}] at depth ${depth} and Skill Level ${skillLevel}`);
		
		engine.postMessage("ucinewgame");
		engine.postMessage("position fen " + fen);
		engine.postMessage("setoption name Skill Level value " + String(skillLevel));
		engine.postMessage("go depth " + String(depth));
		isEngineRunning = true;
		engineProcessingSenderId = senderId;
		engineCurrentLevel = level;
		return true;
	} else {
		// Engine currently analysing previous command
		return false;
	}
}

async function postEngineMove(engineMove) {
	if (isEngineRunning) {
		isEngineRunning = false;
		let senderId = engineProcessingSenderId;
		let level = engineCurrentLevel;
		engineProcessingSenderId = null;
		engineCurrentLevel = null;
		
		makeMove(senderId, engineMove, true)
		.then(position => {
			if (position.move == null) {
				throw 'Unexpected error with engineMove ' + engineMove;
			}
			
			console.log(position.board);
			let response = botLevel[level].emoji + "'s move: " + position.move.san;
			response += "\n\n" + "Move X\n" + position.board;
			
			sendResponse(senderId, response, 1000)
			.then(r => {
				if (position.gameOver) {
					sendResponse(senderId, "Game over! " + position.status, 500);
				} else {
					sendResponse(senderId, position.availableMoves.message, 1500, position.availableMoves.replies)
				}
			});
		})
		.catch(e => console.log(e));
		
		return true;
	} else {
		return false;
	}
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
					let tree = JSON.parse(encoded[1]);
					let nextPayload = [];
					for (const node of tree) {
						if (node.constructor.name === 'Object') {
							// Option with another nested layer of quick replies
							let optionName;
							let nextTree;
							for (const option in node) {
								optionName = option;
								nextTree = JSON.stringify(node[option]);
							}
							nextPayload.push({ content_type: "text", title: optionName, payload: "Tree|" + nextTree });
						} else if (node.constructor.name === 'String') {
							// Option is a move
							nextPayload.push({ content_type: "text", title: node, payload: "Move|" + node });
						} else {
							throw 'Unexpected object type in payload tree';
						}
					}
					sendResponse(senderId, "Options:", 0, nextPayload);
					
					break;
				default:
					console.error("ERROR - Unknown payload: " + payload);
			}
		} else {
			switch(payload) {
				case botLevel[0].payload:
				case botLevel[1].payload:
				case botLevel[2].payload:
				case botLevel[3].payload:
				case botLevel[4].payload:
				case botLevel[5].payload:
					let level;
					for (let i = 0; i < botLevel.length; i++) {
						if (payload == botLevel[i].payload) {
							level = i;
							break;
						}
					}
					
					newGame(senderId, level)
					.then(position => {
						sendResponse(senderId, "New game:\n" + position.board, 0);
					})
					.catch(e => console.log(e));
					break;
				default:
					console.error("ERROR - Unknown payload: " + payload);
			}
		}
	} else if (message.slice(0, 11) == 'debug load ') {
		// DEBUG ONLY
		loadGame(senderId, message.slice(11))
		.then(position => {
			sendResponse(senderId, "Loaded custom position:\n" + position.board, 0);
		})
		.catch(e => console.log(e));
	} else {
		switch(message.toLowerCase()) {
			case 'new game':
				let quickReply = [];
				Object.entries(botLevel).forEach(([key, val]) => {
					quickReply.push({ content_type: "text", title: val.emoji, payload: val.payload })
				});
				sendResponse(senderId, "Starting a new game...", 0)
				.then(r => sendResponse(senderId, "Choose your opponent:", 1000, quickReply));
				break;
			case 'white':
				getBoard(senderId, true)
				.then(board => {
					sendResponse(senderId, "White POV\n" + board, 0);
				});
				break;
			case 'black':
				getBoard(senderId, false)
				.then(board => {
					sendResponse(senderId, "Black POV\n" + board, 0);
				});
				break;
			default:
				playPlayerMove(senderId, message);
		}
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
	send("setoption name Ponder value false");
	send("setoption name MultiPV value 3");
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
