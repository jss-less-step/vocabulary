/**
 * HTTP 工具函数
 */

function setCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
	setCors(res);
	res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';
		req.on('data', (chunk) => {
			body += chunk;
			if (body.length > 5_000_000) {
				req.destroy();
				reject(new Error('Payload too large'));
			}
		});
		req.on('end', () => {
			try {
				const data = body ? JSON.parse(body) : {};
				resolve(data);
			} catch (err) {
				reject(new Error('Invalid JSON'));
			}
		});
		req.on('error', reject);
	});
}

module.exports = {
	setCors,
	sendJson,
	parseJsonBody
};
