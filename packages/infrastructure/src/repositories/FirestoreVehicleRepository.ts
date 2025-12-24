import { injectable } from 'inversify';
import { adminDb } from '../firebase/admin';
import { Timestamp, DocumentData } from 'firebase-admin/firestore';
import { IVehicleRepository, Vehicle } from '@lemonade/core';

@injectable()
export class FirestoreVehicleRepository implements IVehicleRepository {
    async findById(id: string, userId: string): Promise<Vehicle | null> {
        const snap = await adminDb.collection('vehicles').doc(id).get();
        if (!snap.exists) return null;
        
        const vehicle = this.mapToVehicle(snap.data()!);
        
        // Security Check: Ensure the vehicle belongs to the requested user
        if (vehicle.userId !== userId) {
            return null;
        }
        
        return vehicle;
    }

    async create(vehicle: Vehicle): Promise<void> {
        await adminDb.collection('vehicles').doc(vehicle.id).set(vehicle);
    }

    async findByUser(userId: string): Promise<Vehicle[]> {
        const snapshot = await adminDb.collection('vehicles')
            .where('userId', '==', userId)
            .get();

        return snapshot.docs.map(doc => this.mapToVehicle(doc.data()));
    }

    private mapToVehicle(data: DocumentData): Vehicle {
        const createdAt = data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt);

        return {
            id: data.id,
            vin: data.vin,
            userId: data.userId,
            photoUrl: data.photoUrl,
            activeIssuesCount: data.activeIssuesCount ?? 0,
            specs: {
                year: data.specs?.year,
                make: data.specs?.make,
                model: data.specs?.model,
                engine: data.specs?.engine,
                trim: data.specs?.trim,
            },
            createdAt,
        } as Vehicle;
    }
}
