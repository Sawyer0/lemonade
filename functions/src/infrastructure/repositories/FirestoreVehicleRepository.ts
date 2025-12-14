import { injectable } from 'inversify';
import { IVehicleRepository, Vehicle, VehicleSchema } from '@lemonade/core';
import { getFirestore } from 'firebase-admin/firestore';

@injectable()
export class FirestoreVehicleRepository implements IVehicleRepository {
    private db = getFirestore();

    async findById(id: string): Promise<Vehicle | null> {
        const doc = await this.db.collection('vehicles').doc(id).get();
        if (!doc.exists) return null;
        
        const data = doc.data();
        if (!data) return null;

        // Convert Firestore Timestamps to Dates
        const vehicleData = {
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        };

        const result = VehicleSchema.safeParse(vehicleData);
        if (!result.success) {
            console.error(`Vehicle data validation failed for ${id}`, result.error);
            return null; // or throw error depending on strictness policy
        }

        return result.data;
    }

    async findByUser(userId: string): Promise<Vehicle[]> {
        const snapshot = await this.db.collection('vehicles').where('userId', '==', userId).get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            // Convert Firestore Timestamps to Dates
            const vehicleData = {
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
            };

            const result = VehicleSchema.safeParse(vehicleData);
            if (!result.success) {
                console.error(`Vehicle data validation failed for doc ${doc.id} for user ${userId}`, result.error);
                // Depending on strictness, can throw or filter out invalid vehicles
                return null; 
            }
            return result.data;
        }).filter((v): v is Vehicle => v !== null); // Filter out any nulls from failed parsing
    }

    async create(vehicle: Vehicle): Promise<void> {
        await this.db.collection('vehicles').doc(vehicle.id).set(vehicle);
    }
}
