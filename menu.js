const EmojiChess = require('./emojiChess.js');

class Menu {
	static menuRoot = { '🆕 New Game': 'new_game', '🔄 Flip Board': 'flip_board', '💾 Download Game': 'download_game', '❓ Help': 'help_menu' };
	static menuHelp = { '🎮 Playing a Move': 'playing_move', '💬 Other Commands': 'other_commands', '👩‍🏫 Chess Rules': 'chess_rules', 'ℹ️ About EmojiChess': 'about' };
	
	static getMenuPayload() {
		let payload = [];
		for (const option in Menu.menuRoot) {
			payload.push({ content_type: "text", title: option, payload: Menu.menuRoot[option] });
		}
		payload.push({ content_type: "text", title: EmojiChess.symbols.menu.back, payload: EmojiChess.getAvailableMovesPayload });
		return payload;
	}
}

module.exports = Menu;