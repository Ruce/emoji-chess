const { Chess } = require('chess.js')

class Bot {
	constructor(engine, chatInterface, engineOkCallback, makeMoveCallback) {
		this.engine = engine;
		this.chatInterface = chatInterface;
		this.engineOkCallback = engineOkCallback;
		this.makeMoveCallback = makeMoveCallback;
		
		this.isEngineRunning = false;
		this.engineProcessingSenderId;
		this.engineCurrentLevel;
	}
	
	static botLevel = [
		{ emoji: '👶', payload: 'level_0', depth: 1, skill: 0, subOptimal: 0.35, tunnelVision: 0.5},
		{ emoji: '👧', payload: 'level_1', depth: 1, skill: 0, subOptimal: 0.25, tunnelVision: 0.3},
		{ emoji: '🤓', payload: 'level_2', depth: 2, skill: 2, subOptimal: 0.15, tunnelVision: 0.1},
		{ emoji: '🕵️', payload: 'level_3', depth: 3, skill: 5, subOptimal: 0.05, tunnelVision: 0},
		{ emoji: '👴', payload: 'level_4', depth: 5, skill: 7, subOptimal: 0, tunnelVision: 0},
		{ emoji: '🧙‍♂️', payload: 'level_5', depth: 8, skill: 12, subOptimal: 0, tunnelVision: 0},
		{ emoji: '🐐', payload: 'level_6', depth: 13, skill: 19, subOptimal: 0, tunnelVision: 0},
		{ emoji: '👽', payload: 'level_7', depth: 18, skill: 20, subOptimal: 0, tunnelVision: 0}
	];
	
	static pieceValues = { p: 1, b: 3, n: 3, r: 5, q: 9, k: 99 };
	
	// https://stackoverflow.com/a/12646864
	static shuffleArray(arr) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
	}

	static availableCaptures(moves) {
		function sortByNetValue(a, b) {
			return b[1] - a[1];
		}
		
		let capturesWithValues = [];
		for (const move of moves) {
			if (move.flags.indexOf("c") > -1 || move.flags.indexOf("e") > -1) {
				// `netValue`: value of the captured piece minus value of the piece used to capture
				// High netValue generally suggests a preferable move (e.g. capturing a queen with a pawn)
				// compared to a move with low netValue (e.g. capturing a pawn with a queen)
				let netValue = Bot.pieceValues[move.captured] - Bot.pieceValues[move.piece]
				capturesWithValues.push([move, netValue]);
			}
		}
		Bot.shuffleArray(capturesWithValues);
		capturesWithValues.sort(sortByNetValue);
		let captures = capturesWithValues.map(c => c[0]);
		
		return captures;
	}

	static availableChecks(moves) {
		let checks = [];
		for (const move of moves) {
			if (move.san.indexOf("+") > -1 || move.flags.indexOf("#") > -1) {
				checks.push(move);
			}
		}
		Bot.shuffleArray(checks);
		return checks;
	}

	static availablePromotions(moves) {
		let promotions = [];
		for (const move of moves) {
			if (move.flags.indexOf("p") > -1 && move.promotion === 'q') {
				promotions.push(move);
			}
		}
		Bot.shuffleArray(promotions);
		return promotions;
	}

	static isHangingMove(prevFen, move) {
		// Based on position at `prevFen`, return true if `move` will cause the moved piece to be capturable
		// Moved piece does not necessarily have to be "hanging" to return true,
		// i.e. true as long as the moved piece can be captured, regardless of whether it is defended
		// (simulating naive "one-depth" level of analysis)
		const testGame = new Chess(prevFen);
		testGame.move(move.san);
		let newMoves = testGame.moves({ verbose: true });
		
		let isHanging = false;
		for (const m of newMoves) {
			if (m.to == move.to) {
				isHanging = true;
				break;
			}
		}
		
		return isHanging;
	}
	
	static subOptimalMove(fen, tunnelVisionChance) {
		// Simulates naive play where checks, captures, or promotions are made even if suboptimal
		// In addition, probability of `tunnelVisionChance` that the bot plays a random check/capture/promotion
		const game = new Chess(fen);
		const moves = game.moves({ verbose: true });
		const tunnelVision = (Math.random() < tunnelVisionChance);
		
		const promotions = Bot.availablePromotions(moves);
		const captures = Bot.availableCaptures(moves);
		const checks = Bot.availableChecks(moves);
		const possibleMoves = promotions.concat(captures, checks);
		if (possibleMoves.length == 0) {
			return null;
		}
		
		let possibleMovesSan = possibleMoves.map(m => m.san);
		console.log("Playing suboptimal move (tunnel vision " + tunnelVision + ") choosing from: " + possibleMovesSan);
		
		if (tunnelVision) {
			let i = Math.floor(Math.random() * possibleMoves.length);
			let chosenMove = possibleMoves[i];
			return {from: chosenMove.from, to: chosenMove.to, promotion: chosenMove.promotion};
		} else {
			// `possibleMoves` is sorted with promotions as priority, then captures, then checks
			// `captures` are sorted by highest "net value", i.e. lowest value piece capturing highest value piece
			for (const m of possibleMoves) {
				if (!Bot.isHangingMove(fen, m)) {
					return {from: m.from, to: m.to, promotion: m.promotion};
				}
			}
			return null;
		}
	}
	
	startEngineMove(fen, senderId, level) {
		if (this.isEngineRunning) {
			// Engine currently analysing previous command
			return false;
		}
		
		let depth = Bot.botLevel[level].depth;
		let skillLevel = Bot.botLevel[level].skill;
		let subOptimal = Bot.botLevel[level].subOptimal;
		console.log(`Evaluating position [${fen}] with bot level [${level}]`);
		
		this.isEngineRunning = true;
		this.engineProcessingSenderId = senderId;
		this.engineCurrentLevel = level;
		
		let naiveMove = null;
		if (Math.random() < subOptimal) {
			let tunnelVisionChance = Bot.botLevel[level].tunnelVision;
			naiveMove = Bot.subOptimalMove(fen, tunnelVisionChance);
		}
		
		if (naiveMove == null) {
			this.engine.postMessage("ucinewgame");
			this.engine.postMessage("position fen " + fen);
			this.engine.postMessage("setoption name Skill Level value " + String(skillLevel));
			this.engine.postMessage("go depth " + String(depth));
		} else {
			this.postEngineMove(naiveMove);
		}
		
		return true;
	}
	
	async postEngineMove(engineMove) {
		if (!this.isEngineRunning) {
			return false
		}
		
		this.isEngineRunning = false;
		let senderId = this.engineProcessingSenderId;
		let level = this.engineCurrentLevel;
		this.engineProcessingSenderId = null;
		this.engineCurrentLevel = null;
		
		this.makeMoveCallback(senderId, engineMove, true)
		.then(position => {
			if (position.move == null) {
				throw 'Unexpected error with engineMove ' + engineMove;
			}
			
			console.log(position.board);
			let response = Bot.botLevel[level].emoji + "'s move: " + position.move.san;
			response += "\n\n" + "Move X\n" + position.board;
			
			this.chatInterface.sendResponse(senderId, response, 1000)
			.then(r => {
				if (position.gameOver) {
					this.chatInterface.sendResponse(senderId, "Game over! " + position.status, 500);
				} else {
					this.chatInterface.sendResponse(senderId, position.availableMoves.message, 1500, position.availableMoves.replies)
				}
			});
		})
		.catch(e => console.log(e));
		
		return true;
	}
	
	onLog(line) {
		console.log("Line: " + line)
		if (line.indexOf("uciok") > -1) {
			// Sets server port and logs message on success
			this.engineOkCallback();
		} else if (line.indexOf("bestmove") > -1) {
			let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
			if (match) {
				this.postEngineMove({from: match[1], to: match[2], promotion: match[3]});
			}
		}
	}
	
	startEngine() {
		this.engine.addMessageListener(this.onLog.bind(this));

		this.engine.postMessage("uci");
		this.engine.postMessage("setoption name Ponder value false");
		this.engine.postMessage("setoption name MultiPV value 3");
	}
}

module.exports = Bot;