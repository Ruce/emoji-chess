const { Chess } = require('chess.js')

const pieceValues = { p: 1, b: 3, n: 3, r: 5, q: 9, k: 99 }

function availableCaptures(moves) {
	function sortByNetValue(a, b) {
		return b[1] - a[1];
	}
	
	let capturesWithValues = [];
	for (const move of moves) {
		if (move.flags.indexOf("c") > -1 || move.flags.indexOf("e") > -1) {
			// `netValue`: value of the captured piece minus value of the piece used to capture
			// High netValue generally suggests a preferable move (e.g. capturing a queen with a pawn)
			// compared to a move with low netValue (e.g. capturing a pawn with a queen)
			let netValue = pieceValues[move.captured] - pieceValues[move.piece]
			capturesWithValues.push([move, netValue]);
		}
	}
	capturesWithValues.sort(sortByNetValue);
	let captures = capturesWithValues.map(c => c[0]);
	
	return captures;
}

function availableChecks(moves) {
	let checks = [];
	for (const move of moves) {
		if (move.san.indexOf("+") > -1 || move.flags.indexOf("#") > -1) {
			let pieceValue = pieceValues[move.piece];
			console.log(move.san + ": " + String(pieceValue));
			checks.push(move);
		}
	}
	return checks;
}

function availablePromotions(moves) {
	let promotions = [];
	for (const move of moves) {
		if (move.flags.indexOf("p") > -1 && move.promotion === 'q') {
			console.log(move.san);
			promotions.push(move);
		}
	}
	return promotions;
}

function isHangingMove(prevFen, move) {
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

let fen = "6rk/P5pp/8/8/8/2p5/1QRP4/3N3K w - - 0 1";
const chess = new Chess(fen);
let moves = chess.moves({verbose: true});

let captures = availableCaptures(moves);
for (const c of captures) {
	console.log(c.san + " is hanging: " + isHangingMove(fen, c));
}


//availableChecks(moves);
console.log(availablePromotions(moves));