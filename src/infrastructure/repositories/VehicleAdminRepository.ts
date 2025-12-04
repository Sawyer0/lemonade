import { injectable } from 'inversify';
import { adminDb } from '@/infrastructure/firebase/admin';
import { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { Vehicle } from '@/core/types/models';

@injectable()
export class VehicleAdminRepository implements IVehicleRepository {
    async findById(id: string): Promise<Vehicle | null> {
        const snap = await adminDb.collection('vehicles').doc(id).get();
        return snap.exists ? (snap.data() as Vehicle) : null;
    }

    async create(vehicle: Vehicle): Promise<void> {
        // Convert Date objects to Firestore Timestamps if needed, 
        // but admin SDK handles JS Dates well.
        await adminDb.collection('vehicles').doc(vehicle.id).set(vehicle);
    }

    async findByUser(userId: string): Promise<Vehicle[]> {
        const snapshot = await adminDb.collection('vehicles')
            .where('userId', '==', userId)
            .get();

        return snapshot.docs.map(doc => doc.data() as Vehicle);
    }
}
