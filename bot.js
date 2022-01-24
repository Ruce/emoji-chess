class Bot {
	constructor(engine, chatInterface) {
		this.engine = engine;
		this.chatInterface = chatInterface;
		
		this.isEngineRunning = false;
		this.engineProcessingSenderId;
		this.engineCurrentLevel;
	}
	
	static botLevel = [
		{ emoji: '👶', payload: 'level_0', depth: 1, skill: 0},
		{ emoji: '👧', payload: 'level_1', depth: 2, skill: 1},
		{ emoji: '🤓', payload: 'level_2', depth: 5, skill: 5},
		{ emoji: '👨‍🦳', payload: 'level_3', depth: 8, skill: 10},
		{ emoji: '🧙‍♂️', payload: 'level_4', depth: 12, skill: 15},
		{ emoji: '👽', payload: 'level_5', depth: 18, skill: 20}
	]
	
	startEngine(engineOkCallback, makeMoveCallback) {
		this.engine.addMessageListener(function onLog(line)
		{
			console.log("Line: " + line)
			if (line.indexOf("uciok") > -1) {
				// Sets server port and logs message on success
				engineOkCallback();
			} else if (line.indexOf("bestmove") > -1) {
				let match = line.match(/^bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
				if (match) {
					postEngineMove({from: match[1], to: match[2], promotion: match[3]}, makeMoveCallback);
				}
			}
		});

		this.engine.postMessage("uci");
		this.engine.postMessage("setoption name Ponder value false");
		this.engine.postMessage("setoption name MultiPV value 3");
	}
	
	startEngineMove(fen, senderId, level) {
		if (this.isEngineRunning) {
			// Engine currently analysing previous command
			return false;
		}
		
		let depth = Bot.botLevel[level].depth;
		let skillLevel = Bot.botLevel[level].skill;
		console.log(`Evaluating position [${fen}] at depth ${depth} and Skill Level ${skillLevel}`);
		
		this.engine.postMessage("ucinewgame");
		this.engine.postMessage("position fen " + fen);
		this.engine.postMessage("setoption name Skill Level value " + String(skillLevel));
		this.engine.postMessage("go depth " + String(depth));
		
		this.isEngineRunning = true;
		this.engineProcessingSenderId = senderId;
		this.engineCurrentLevel = level;
		
		return true;
	}
	
	async postEngineMove(engineMove, makeMoveCallback) {
		if (!this.isEngineRunning) {
			return false
		}
		
		this.isEngineRunning = false;
		let senderId = this.engineProcessingSenderId;
		let level = this.engineCurrentLevel;
		this.engineProcessingSenderId = null;
		this.engineCurrentLevel = null;
		
		makeMoveCallback(senderId, engineMove, true)
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
}

module.exports = Bot;