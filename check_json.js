const fs = require('fs');

let key = '';
try {
    const content = fs.readFileSync('.env.local', 'utf8');
    const lines = content.split('\n');
    const line = lines.find(l => l.startsWith('FIREBASE_SERVICE_ACCOUNT_KEY='));

    if (!line) {
        console.log('Key not found in file');
        process.exit(1);
    }

    key = line.substring('FIREBASE_SERVICE_ACCOUNT_KEY='.length);

    // Handle quotes
    if (key.startsWith("'") && key.endsWith("'")) {
        key = key.substring(1, key.length - 1);
    } else if (key.startsWith('"') && key.endsWith('"')) {
        key = key.substring(1, key.length - 1);
    }

    console.log(`Key length: ${key.length}`);
    if (key.length > 0) {
        console.log(`First char code: ${key.charCodeAt(0)}`);
    }

    JSON.parse(key);
    console.log('JSON is valid');

} catch (e) {
    console.log('JSON Error:', e.message);
    const match = e.message.match(/position (\d+)/);
    if (match) {
        const pos = parseInt(match[1]);
        if (pos < 0 || pos >= key.length) {
            console.log('Position out of bounds');
        } else {
            const char = key.charAt(pos);
            console.log(`Char at ${pos}: '${char}' (Code: ${char.charCodeAt(0)})`);
            const start = Math.max(0, pos - 5);
            const end = Math.min(key.length, pos + 5);
            const context = key.substring(start, end);
            console.log(`Context codes: ${context.split('').map(c => c.charCodeAt(0)).join(',')}`);
        }
    }
}
