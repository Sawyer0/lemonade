import { renderHook, act } from '@testing-library/react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { useSessionVehicle } from '../useSessionVehicle';

jest.mock('firebase/firestore');
jest.mock('../../infrastructure/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

type SnapshotListener = (snapshot: { exists: () => boolean; data: () => Record<string, unknown> | undefined }) => void;

const listeners = new Map<string, SnapshotListener>();

describe('useSessionVehicle', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        listeners.clear();
        (doc as jest.Mock).mockImplementation((_db: unknown, collection: string, id: string) => `${collection}/${id}`);
        (onSnapshot as jest.Mock).mockImplementation((path: string, listener: SnapshotListener) => {
            listeners.set(path, listener);
            return jest.fn();
        });
    });

    const emit = (path: string, data: Record<string, unknown> | undefined) =>
        act(() => listeners.get(path)?.({ exists: () => data !== undefined, data: () => data }));

    it('reads the vehicle id from the session and then loads the vehicle', () => {
        const { result } = renderHook(() => useSessionVehicle('session-1'));
        expect(result.current.loading).toBe(true);

        emit('sessions/session-1', { vehicleId: 'vehicle-9' });
        expect(result.current.vehicleId).toBe('vehicle-9');

        emit('vehicles/vehicle-9', { id: 'vehicle-9', make: 'Honda' });
        expect(result.current.vehicle).toMatchObject({ make: 'Honda' });
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeNull();
    });

    it('reports a session without a vehicle', () => {
        const { result } = renderHook(() => useSessionVehicle('session-2'));
        emit('sessions/session-2', { status: 'active' });
        expect(result.current.error).toBe('Session has no vehicle');
        expect(result.current.loading).toBe(false);
    });

    it('does nothing without a session id', () => {
        const { result } = renderHook(() => useSessionVehicle(undefined));
        expect(onSnapshot).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });
});
