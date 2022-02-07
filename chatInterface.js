const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

class ChatInterface {
    constructor(endpointUrl, accessToken) {
		this.messageUrl = endpointUrl + new URLSearchParams({access_token: accessToken})
	}
	
	static typingIndicatorMaxDelay = 600;

	async postData(data = {}) {
		const response = await fetch(this.messageUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});
		return response.json(); // parses JSON response into native JavaScript objects
	}

	async typingOn(senderId) {
		let body = {
			recipient: {
				id: senderId
			},
			sender_action: "typing_on"
		};
		
		let response = await this.postData(body);
		return response;
	}

	async sendResponse(senderId, message, sendDelay, quickReplies = null) {
		if (sendDelay && sendDelay > 0) {
			// Turn on typing indicator and add a short delay so that messages feel like they're being typed out
			// Typing indicator also needs to be delayed, otherwise it can be clipped by a previous message
			const typingIndicatorDelay = Math.min(ChatInterface.typingIndicatorMaxDelay, sendDelay / 2);
			const remainingDelay = sendDelay - typingIndicatorDelay;
			
			await new Promise(r => setTimeout(r, typingIndicatorDelay));
			this.typingOn(senderId);
			await new Promise(r => setTimeout(r, remainingDelay));
		}
		
		let messageBody = {
			messaging_type: "RESPONSE",
			recipient: {
				id: senderId
			},
			message: {
				text: message
			}
		}
		
		if (quickReplies !== null) {
			messageBody.message.quick_replies = quickReplies;
		}
		
		this.postData(messageBody)
		.then(data => {
			console.log(data); // JSON data parsed by `data.json()` call
		});
		
		return true;
	}
}

module.exports = ChatInterface;