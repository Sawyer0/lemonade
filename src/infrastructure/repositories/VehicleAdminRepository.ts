import { injectable } from 'inversify';
import { adminDb } from '@/infrastructure/firebase/admin';
import { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { Vehicle } from '@/core/entities/Vehicle';

@injectable()
export class VehicleAdminRepository implements IVehicleRepository {
    async findById(id: string): Promise<Vehicle | null> {
        const snap = await adminDb.collection('vehicles').doc(id).get();
        return snap.exists ? this.mapToVehicle(snap.data()!) : null;
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

        return snapshot.docs.map(doc => this.mapToVehicle(doc.data()));
    }

    // Use unknown for the input to be safe, but usually it's DocumentData
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToVehicle(data: any): Vehicle {
        return {
            ...data,
            // Convert Firestore Timestamp to Date if necessary
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now())
        } as Vehicle;
    }
}
