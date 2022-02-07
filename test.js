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
	
	function splitByFile(pieceMoves) {
		let files = {};
		for (const move of pieceMoves) {
			const file = move.to.charAt(0);
			if (files.hasOwnProperty(file)) {
				files[file].push(move.san);
			} else {
				files[file] = [move.san];
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
	
	let payload = [];
	if (moves.length <= 12) {
		payload = moves.map(move => move.san);
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
					payload.push(pieceInstances[from][0].san);
				} else if (pieceInstances[from].length <= 12) {
					// Since there are 12 or fewer legal moves for this piece instance,
					// next quick reply can display all moves
					payload.push({ [from]: pieceInstances[from].map(move => move.san) });
				} else {
					// More than 12 legal moves for this piece instance
					// Further split the destinations by files
					let pieceTree = splitByFile(pieceInstances[from]);
					payload.push({ [from]: pieceTree });
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

const chess = new Chess(); // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
//const chess = new Chess("3qkbnr/pPpppppp/4b3/8/1P1P4/PR1RP3/1N1B1PPP/3QKBN1 w - - 0 1");
//const chess = new Chess("r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4");

while (!chess.game_over()) {
	const moves = chess.moves()
	const move = moves[Math.floor(Math.random() * moves.length)]
	chess.move(move)
}

//for (let k = 0; k < 3; k++) {
//	const moves = chess.moves()
//	const move = moves[Math.floor(Math.random() * moves.length)]
//	chess.move(move)
//}

//console.log(availableMoves(chess.moves()));

chess.header('White', 'TestW', 'Black', 'TestB');

const board = chess.board()
console.log(chess.moves())
console.log('--- Start PGN ---')
console.log(chess.pgn())
console.log('--- End PGN ---')
console.log(chess.fen())
console.log(chess.ascii())

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