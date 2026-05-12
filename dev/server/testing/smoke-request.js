import http from 'node:http';

export function requestText(url, {
    method = 'GET',
    headers = {},
} = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request(url, {
            method,
            headers: {
                Connection: 'close',
                ...headers,
            },
            agent: false,
        }, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                resolve({
                    status: response.statusCode ?? 0,
                    headers: response.headers,
                    text: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });

        request.on('error', reject);
        request.end();
    });
}

