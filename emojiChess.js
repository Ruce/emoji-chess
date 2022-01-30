class EmojiChess {
	static symbols = {
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
		},
		menu: {
			back: "🔙"
		}
	}
	
	static getAvailableMovesPayload = "get_available_moves";
	
	static outputBoard(board, from, isWhitePov = true) {
		const symbols = EmojiChess.symbols;
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

	static formatMove(move, piece, color) {
		// Formats a SAN move to replace the piece letter with its emoji
		// Except for pawn moves and castling
		// e.g. Nf3 -> 🦄f3
		if (piece == 'p' || move.charAt(0) == 'O') {
			return move;
		} else {
			return EmojiChess.symbols.pieces[color][piece] + move.slice(1);
		}
	}

	static encodeTree(moves, title) {
		// Divides up available moves for a particular piece (knight, bishop, etc.) into a tree
		// Where each layer of the tree has no more than 12 nodes
		// Returns a payload that can be decoded and used as the quick reply payload
		// Note: Tree is an array with 1 element - an object with `title` as the property, e.g. [{ [title]: payload }]
		
		// Example tree 1 (one layer):
		// Knights at starting position for white
		// payload = ['Na3', 'Nc3', 'Nf3', 'Nh3']
		
		// Example tree 2 (two layers):
		// Rook on a1 with an otherwise empty board
		// payload = [{'a-file': ['Ra2', 'Ra3', 'Ra4', 'Ra5', 'Ra6', 'Ra7', 'Ra8']}, 'Rb1', 'Rc1', 'Rd1', 'Re1', 'Rf1', 'Rg1', 'Rh1']
		
		// Example tree 3 (three layers):
		// Rooks on a1 and c1 with an otherwise empty board
		// payload = [{'R on a1': ['Ra2', 'Ra3', 'Ra4', 'Ra5', 'Ra6', 'Ra7', 'Ra8', 'Rab1']},
		//	{'R on c1': ['Rcb1', {'c-file': ['Rc2', 'Rc3', 'Rc4', 'Rc5', 'Rc6', 'Rc7', 'Rc8']}, 'Rd1', 'Re1', 'Rf1', 'Rg1', 'Rh1']}]
		
		if (moves.constructor.name !== 'Array' || moves.length === 0) {
			throw 'Invalid argument `moves` in encodeTree()';
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
		let pieceEmoji = EmojiChess.symbols.pieces[color][piece];
		
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
		
		return [{ [title]: payload}];
	}
	
	static decodeTree(encoded) {
		// `encoded` is an array containing the quick replies move tree for a particular piece
		// The `encoded` array is generated by getAvailableMoves(), where element 0 = "Tree",
		// element 1 is the encoded moves string, and element 2 is the current position in the tree
		
		let tree = JSON.parse(encoded[1]);
		// `position` is the "coordinates" of our current position in the tree
		// e.g. 2,3 indicates we are at element tree[2][3]	
		let position = encoded[2].split(',');
		
		let nextPayload = [];
		let currTree = tree;
		for (const p of position) {
			let title = Object.keys(currTree[p])[0];
			currTree = currTree[p][title];
		}
			
		for (let i = 0; i < currTree.length; i++) {
			let node = currTree[i];
			if (node.constructor.name === 'Object') {
				// Option with another nested layer of quick replies
				let optionName = Object.keys(node)[0];
				let nextTree = node[optionName];
				let nodePosition = [...position].push(i);
				nextPayload.push({ content_type: "text", title: optionName, payload: "Tree|" + nextTree + "|" + nodePosition.join(',') });
			} else if (node.constructor.name === 'String') {
				// Option is a move
				nextPayload.push({ content_type: "text", title: node, payload: "Move|" + node });
			} else {
				throw 'Unexpected object type in payload tree';
			}
		}
		
		let backPayload;
		if (position.length > 1) {
			backPayload = "Tree|" + encoded[1] + "|" + [...position].pop.join(',');
		} else {
			backPayload = EmojiChess.getAvailableMovesPayload;
		}
		nextPayload.push({ content_type: "text", title: EmojiChess.symbols.menu.back, payload: backPayload });
		
		return nextPayload;
	}

	static getAvailableMoves(moves) {
		const symbols = EmojiChess.symbols;
		
		if (moves.length == 0) {
			throw 'No available moves supplied';
		}
		
		let quickReplies = [];
		let isWhitesTurn = ( moves[0].color == 'w' )
		
		if (moves.length <= 12) {
			for (const move of moves) {
				quickReplies.push({ content_type: "text", title: EmojiChess.formatMove(move.san, move.piece, move.color), payload: "Move|" + move.san });
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
		
		// For each piece, encode the available moves into a tree that is used to populate later quick replies
		// A tree has nested arrays, with each array containing the options for quick replies
		if (pawnMoves.length > 0) {
			let titleP = isWhitesTurn ? symbols.pieces.w.p : symbols.pieces.b.p;
			titleP += " (Pawn)";
			let payloadP = "Tree|" + JSON.stringify(EmojiChess.encodeTree(pawnMoves, titleP)) + "|0";
			quickReplies.push({content_type: "text", title: titleP, payload: payloadP});
		}
		
		if (knightMoves.length > 0) {
			let titleN = isWhitesTurn ? symbols.pieces.w.n : symbols.pieces.b.n;
			titleN += " (Knight)";
			let payloadN = "Tree|" + JSON.stringify(EmojiChess.encodeTree(knightMoves, titleN)) + "|0";
			quickReplies.push({content_type: "text", title: titleN, payload: payloadN});
		}
		
		if (bishopMoves.length > 0) {
			let titleB = isWhitesTurn ? symbols.pieces.w.b : symbols.pieces.b.b;
			titleB += " (Bishop)";
			let payloadB = "Tree|" + JSON.stringify(EmojiChess.encodeTree(bishopMoves, titleB)) + "|0";
			quickReplies.push({content_type: "text", title: titleB, payload: payloadB});
		}
		
		if (rookMoves.length > 0) {
			let titleR = isWhitesTurn ? symbols.pieces.w.r : symbols.pieces.b.r;
			titleR += " (Rook)";
			let payloadR = "Tree|" + JSON.stringify(EmojiChess.encodeTree(rookMoves, titleR)) + "|0";
			quickReplies.push({content_type: "text", title: titleR, payload: payloadR});
		}
		
		if (queenMoves.length > 0) {
			let titleQ = isWhitesTurn ? symbols.pieces.w.q : symbols.pieces.b.q;
			titleQ += " (Queen)";
			let payloadQ = "Tree|" + JSON.stringify(EmojiChess.encodeTree(queenMoves, titleQ)) + "|0";
			quickReplies.push({content_type: "text", title: titleQ, payload: payloadQ});
		}
		
		if (kingMoves.length > 0) {
			let titleK = isWhitesTurn ? symbols.pieces.w.k : symbols.pieces.b.k;
			titleK += " (King)";
			let payloadK = "Tree|" + JSON.stringify(EmojiChess.encodeTree(kingMoves, titleK)) + "|0";
			quickReplies.push({content_type: "text", title: titleK, payload: payloadK});
		}
		
		return { message: 'Your turn! Pick a piece:', replies: quickReplies };
	}
}

module.exports = EmojiChess;