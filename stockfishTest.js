var Stockfish;
var engine;

var INIT_ENGINE = require("stockfish");

var wasmPath = require.resolve("stockfish/src/stockfish.wasm");
var mod = {
	locateFile: function (path)
	{
		if (path.indexOf(".wasm") > -1) {
			/// Set the path to the wasm binary.
			return wasmPath;
		} else {
			/// Set path to worker (self + the worker hash)
			return __filename;
		}
	},
};

if (typeof INIT_ENGINE === "function") {
	var Stockfish = INIT_ENGINE();
	try {
		Stockfish(mod).then(function (sf)
		{
			engine = sf;
			start();
		});
	} catch (e) {
		console.error(e);
	}
}

function start() {
	function send(str) {
		console.log("Sending: " + str)
		engine.postMessage(str);
	}

	engine.addMessageListener(function onLog(line)
    {
        var match;
        console.log("Line: " + line)
		
		if (line.indexOf("uciok") > -1) {
			engine.terminate();
		}
	});

	send("uci");
}

