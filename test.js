const { Chess } = require('chess.js')

const symbols = {
	pieces: {
		w: {
			p: "P",
			n: "N",
			b: "B",
			r: "R",
			q: "Q",
			k: "K"
		},
		b: {
			p: "p",
			n: "n",
			b: "b",
			r: "r",
			q: "q",
			k: "k"
		}
	},
	board: {
		rank: ["8", "7", "6", "5", "4", "3", "2", "1"],
		file: ["a", "b", "c", "d", "e", "f", "g", "h"],
		lightTile: "-",
		darkTile: "*",
		origin: "X"
	}
}

function availableMoves(moves) {
	let pawn = [];
	let knight = [];
	let bishop = [];
	let rook = [];
	let queen = [];
	let king = [];
	
	for (const move of moves) {
		switch (move.charAt(0)) {
			case "N":
				knight.push(move);
				break;
			case "B":
				bishop.push(move);
				break;
			case "R":
				rook.push(move);
				break;
			case "Q":
				queen.push(move);
				break;
			case "K":
			case "O":
				king.push(move);
				break;
			default:
				pawn.push(move);
		}
	}
	
	let result = {
		"pawn": pawn,
		"knight": knight,
		"bishop": bishop,
		"rook": rook,
		"queen": queen,
		"king": king
	};
	
	return result;
}

const chess = new Chess("rnbqkbnr/3ppppp/ppp5/8/8/4PN2/PPPPBPPP/RNBQK2R w KQkq - 0 4"); // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
//const chess = new Chess("3qkbnr/pPpppppp/4b3/8/1P1P4/PR1RP3/1N1B1PPP/3QKBN1 w - - 0 1");
//const chess = new Chess("r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4");

//while (!chess.game_over()) {
//	const moves = chess.moves()
//	const move = moves[Math.floor(Math.random() * moves.length)]
//	chess.move(move)
//}

for (let k = 0; k < 3; k++) {
	const moves = chess.moves()
	//const move = moves[Math.floor(Math.random() * moves.length)]
	//chess.move(move)
}

//console.log(availableMoves(chess.moves()));

const board = chess.board()

console.log(chess.moves())
console.log(chess.moves({verbose: true}))
console.log(chess.pgn())
console.log(chess.fen())
console.log(chess.ascii())
//console.log(board)

//console.log('8️⃣🕋🐴🏃🏿👸🏿🤴🏿🏃🏿🐴🕋7️⃣️♟♟️♟️♟️♟️♟️♟️♟️6️⃣⬜⬛⬜⬛⬜⬛⬜⬛5️⃣⬛⬜⬛⬜⬛⬜⬛⬜4️⃣⬜⬛⬜⬛⬜⬛⬜⬛3️⃣⬛⬜⬛⬜⬛⬜⬛⬜2️⃣🕯️🕯️🕯️🕯️🕯️🕯️🕯️🕯️1️⃣🏰🦄🏃🏻👸🏻🤴🏻🏃🏻🦄🏰🏁🇦​🇧​🇨​🇩​🇪​🇫​🇬​🇭')


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
			rows.push(row.join());
		} else {
			// From black's perspective, horizontally mirror rows and build board from bottom up
			row.reverse()
			row.unshift(symbols.board.rank[i]); // Add rank number indicators
			rows.unshift(row.join());
		}
	}
	
	let output = rows.join("\n");
	if (isWhite) {
		xAxis = symbols.board.origin + symbols.board.file.join(""); // Add file indicators
		output += "\n" + xAxis;
	} else {
		xAxis = symbols.board.origin + symbols.board.file.slice().reverse().join(""); // Add file indicators
		output += "\n" + xAxis;
	}
	return output;
}

//console.log(outputBoard(board))