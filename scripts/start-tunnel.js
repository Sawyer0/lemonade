/* eslint-disable @typescript-eslint/no-require-imports */
const localtunnel = require('localtunnel');

(async () => {
    console.log('Starting tunnel...');
    try {
        const tunnel = await localtunnel({ port: 3000 });
        console.log('TUNNEL_URL=' + tunnel.url);

        tunnel.on('close', () => {
            console.log('Tunnel closed');
        });

        // Keep alive
        setInterval(() => { }, 1000);
    } catch (err) {
        console.error('Tunnel error:', err);
    }
})();
