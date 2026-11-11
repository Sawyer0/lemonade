import * as fs from 'fs';
import * as path from 'path';

/**
 * No brand color may be hardcoded in mobile source outside the tokens
 * file (packages/core/src/config/brandTokens.ts) and its one JSON mirror
 * (mobile/app.json adaptiveIcon background). This test scans every mobile
 * .ts/.tsx file for hex color literals and rgb()/rgba() calls.
 *
 * Each allowed literal carries a reason it is not a brand color:
 * Material shadow neutrals, black/white camera-overlay chrome over a
 * video feed that is dark in both modes, and the Meta native-module
 * fallback, which has no @mobile alias and cannot import the tokens.
 * Additions to this list need a reason, not just a value. The test also
 * fails on stale entries, so the list cannot silently outlive the code.
 */

const MOBILE_ROOT = path.resolve(__dirname, '..');

const ALLOWED_LITERALS: Record<string, string[]> = {
    // shadowColor neutral + video preview surface + capture-button border
    // over the (always dark) camera feed.
    'app/connect-glasses.tsx': ['#000', '#fff', 'rgba(0,0,0,0.7)'],
    // Camera overlay chrome: scrim and text over the scanner feed.
    'components/VinScanner.tsx': ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.8)'],
    // Overlay scrim over the detection feed.
    'components/camera/DetectionHUD.tsx': ['rgba(0,0,0,0.7)'],
    // Overlay scrim over the chat camera feed.
    'components/screens/ChatScreen.native.tsx': ['rgba(0,0,0,0.8)'],
    // Camera overlay chrome: scrims, borders, and glass panels over the
    // mechanic camera feed.
    'components/screens/MechanicScreen.native.tsx': [
        'rgba(0,0,0,0.6)',
        'rgba(0,0,0,0.5)',
        'rgba(255,255,255,0.1)',
        'rgba(255,255,255,0.5)',
        'rgba(255, 255, 255, 0.2)',
    ],
    // Material shadow neutrals.
    'components/ui/Fab.tsx': ['#000'],
    'components/ui/GlassCard.ios.tsx': ['#000'],
    'components/ui/GlassCard.native.tsx': ['#000'],
    // Native-module fallback neutrals; this file lives in
    // modules/meta-wearables with no @mobile alias, so it cannot import
    // the tokens or the hook.
    'modules/meta-wearables/src/MetaStreamView.tsx': ['#333', '#888'],
};

function collectSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(full, out);
        } else if (/\.tsx?$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

describe('no hardcoded brand colors', () => {
    it('finds no hex or rgb literal outside the allowlist', () => {
        const violations: string[] = [];
        const seen = new Set<string>();
        for (const file of collectSourceFiles(MOBILE_ROOT)) {
            const relative = path.relative(MOBILE_ROOT, file);
            const withoutComments = fs
                .readFileSync(file, 'utf8')
                // Block comments first (they can span lines, e.g. a doc
                // comment naming an Expo issue), then line comments.
                // Naive: a `//` inside a string literal is also cut, but
                // no mobile source puts a color literal after one.
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .split('\n')
                .map((line) => line.replace(/\/\/.*$/, ''))
                .join('\n');
            const literals = [
                ...withoutComments.matchAll(/#[0-9A-Fa-f]{3,8}\b/g),
                ...withoutComments.matchAll(/rgba?\([^)]*\)/g),
            ].map((match) => match[0]);
            for (const literal of literals) {
                seen.add(`${relative}::${literal}`);
                if (!(ALLOWED_LITERALS[relative] ?? []).includes(literal)) {
                    violations.push(`${relative}: ${literal}`);
                }
            }
        }
        expect(violations).toEqual([]);
        for (const [relative, literals] of Object.entries(ALLOWED_LITERALS)) {
            for (const literal of literals) {
                expect(seen.has(`${relative}::${literal}`)).toBe(true);
            }
        }
    });
});
