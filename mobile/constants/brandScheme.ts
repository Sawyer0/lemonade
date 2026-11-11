/**
 * The color scheme the mobile app renders in.
 *
 * The app forces dark today (constants/theme.ts pins Theme to Colors.dark and
 * the stack layouts hardcode dark surfaces), so this returns 'dark'. #46 owns
 * the mode toggle; when it lands, the stored setting plugs in here and every
 * token-driven surface follows without touching the components.
 */
export function resolveBrandColorScheme(): 'light' | 'dark' {
    return 'dark';
}
