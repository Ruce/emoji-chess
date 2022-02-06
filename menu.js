const EmojiChess = require('./emojiChess.js');

class Menu {
	// Payloads for various menu button options
	static plNewGame = 'new_game';
	static plFlipBoard = 'flip_board';
	static plDownloadGame = 'download_game';
	static plHelpMenu = 'help_menu';
	static plPlayingMove = 'playing_move';
	static plPlayingMoveA = 'playing_move_a';
	static plPlayingMoveB = 'playing_move_b';
	static plOtherCommands = 'other_commands';
	static plChessRules = 'chess_rules';
	static plAbout = 'about';
	static plDownloadFen = 'download_fen';
	static plDownloadPgn = 'download_pgn';
	
	static helpPlayingMove	= 'To make a move, you can either: 🅰️ select the piece and move presented in the "quick reply" section, or 🅱️ type in the move using Standard Algebraic Notation (SAN).';
	static helpPlayingMoveA = '🅰️ Select a move with quick replies';
	static helpPlayingMoveB = '🅱️ Type a move using SAN\n\nStandard Algebraic Notation (SAN) is used to describe where a piece has moved to, for each turn in a chess game.\n\nMoves are usually denoted by the piece letter (e.g. R for rook) and the destination square (e.g. Rb1 moves the rook to the b-file on the first rank). Pawn moves are an exception, as they are described using only the destination square (e.g. e4 moves the pawn to the e-file on the fourth rank).\n\n(🤓: Remember that SAN is case sensitive - piece letters are uppercase and coordinates are lowercase!)\n\nCaptures are denoted with an "x" written before the destination square. For example, Rxb1 refers to the rook capturing a piece on the b1 square, while exd5 refers to the pawn on the e-file capturing a piece on the d5 square.\n\nFor EmojiChess, checks (+) and checkmates (#) do NOT need to be included in the notation when typing a move. Also, castling is denoted using the letter \'O\', e.g. O-O for king side castling.\n\nFind out more about algebraic notation, such as how to disambiguate moves for two identical pieces, on Wikipedia: https://en.wikipedia.org/wiki/Algebraic_notation_(chess)';
	
	static menuRoot = {
		[EmojiChess.symbols.menu.newGame + ' New Game']: Menu.plNewGame,
		[EmojiChess.symbols.menu.flipBoard + ' Flip Board']: Menu.plFlipBoard,
		[EmojiChess.symbols.menu.downloadGame + ' Download Game']: Menu.plDownloadGame,
		[EmojiChess.symbols.menu.helpMenu + ' Help']: Menu.plHelpMenu
	};
	static helpMenu = {
		[EmojiChess.symbols.menu.playingMove + ' Playing a Move']: Menu.plPlayingMove,
		[EmojiChess.symbols.menu.otherCommands + ' Other Commands']: Menu.plOtherCommands,
		[EmojiChess.symbols.menu.chessRules + ' Chess Rules']: Menu.plChessRules,
		[EmojiChess.symbols.menu.about + ' About EmojiChess']: Menu.plAbout
	};
	
	static getMenuRootPayload() {
		let payload = [];
		for (const option in Menu.menuRoot) {
			payload.push({ content_type: "text", title: option, payload: "Menu|" + Menu.menuRoot[option] });
		}
		payload.push({ content_type: "text", title: EmojiChess.symbols.menu.back, payload: EmojiChess.plGetAvailableMoves });
		return payload;
	}
	
	static getHelpMenuPayload() {
		let payload = [];
		for (const option in Menu.helpMenu) {
			payload.push({ content_type: "text", title: option, payload: "Menu|" + Menu.helpMenu[option] });
		}
		payload.push({ content_type: "text", title: EmojiChess.symbols.menu.back, payload: "Menu|" + EmojiChess.plMenuRoot });
		return payload;
	}
}

module.exports = Menu;