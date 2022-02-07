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
	
	static helpPlayingMove	= '📙 Playing a Move 📙\n\nTo make a move, you can either:\n🅰️ Select the piece and move presented in the "quick reply" section, or\n🅱️ Type in the move with Standard Algebraic Notation (SAN).';
	static helpPlayingMoveA1 = '🅰️ Select a move with quick replies\n\nDuring your turn, you are presented with all available moves in the current position. Choose the piece that you wish to move, and then the destination square, which is denoted in Standard Algebraic Notation (SAN).'
	static helpPlayingMoveA2 = 'If there are two or more of the piece you chose (e.g. two rooks), you may first need to pick the specific piece to move based on its origin square (e.g. rook currently on a1).\n\nIn addition, if there are too many moves to fit onto the screen, select the destination file before picking the exact move to play. (🤓 says: Files are the vertical columns lettered from a to h!) ';
	static helpPlayingMoveB1 = '🅱️ Type a move in SAN\n\nStandard Algebraic Notation (SAN) is used to describe where a piece has moved to, for each turn in a chess game.\n\nMoves are usually denoted by the piece letter (e.g. R for rook) and the destination square (e.g. Rb1 moves the rook to the b-file on the first rank). Pawn moves are an exception, as they are described using only the destination square (e.g. e4 moves the pawn to the e-file on the fourth rank).\n\n🤓 says: Remember that \'K\' is for King, while \'N\' is for kNight!';
	static helpPlayingMoveB2 = 'Captures are denoted with an "x" written before the destination square. For example, Rxb1 refers to the rook capturing a piece on the b1 square, while exd5 refers to the pawn on the e-file capturing a piece on the d5 square. (🤓 adds: SAN is case sensitive - piece letters are uppercase and coordinates are lowercase!)\n\nIn EmojiChess, checks (+) and checkmates (#) do not need to be included in the notation when typing a move. Also, castling is denoted using the letter \'O\', e.g. O-O for king side castling.\n\nFor a full breakdown of algebraic notation, such as how to disambiguate moves for two identical pieces, check out the Wikipedia article: https://en.wikipedia.org/wiki/Algebraic_notation_(chess)';
	
	static helpAbout = EmojiChess.symbols.pieces.b.p + ' EmojiChess is a non-commercial side project made by the developers at DetoxAI (www.detoxai.com). EmojiChess does not claim any rights against the emoji icons designed by Meta Facebook.'
	
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