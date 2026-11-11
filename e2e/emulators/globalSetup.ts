import { setup, teardown } from '../smoke/globalSetup';

/** Same server as the smoke suite: next start + NHTSA fixtures + offline model, on the emulators. */
export default async function globalSetup(): Promise<() => Promise<void>> {
    await setup();
    return teardown;
}
