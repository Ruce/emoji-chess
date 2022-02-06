const EmojiChess = require('./emojiChess.js');

class Menu {
	// Payloads for various menu button options
	static plNewGame = 'new_game';
	static plFlipBoard = 'flip_board';
	static plDownloadGame = 'download_game';
	static plHelpMenu = 'help_menu';
	static plPlayingMove = 'playing_move';
	static plOtherCommands = 'other_commands';
	static plChessRules = 'chess_rules';
	static plAbout = 'about';
	static plDownloadFen = 'download_fen';
	static plDownloadPgn = 'download_pgn';
	
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