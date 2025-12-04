import { injectable } from 'inversify';
import { db } from '@/infrastructure/firebase/config';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { IVehicleRepository } from '@/core/interfaces/IVehicleRepository';
import { Vehicle } from '@/core/entities/Vehicle';

@injectable()
export class VehicleFirestoreRepository implements IVehicleRepository {
    async findById(id: string): Promise<Vehicle | null> {
        const snap = await getDoc(doc(db, 'vehicles', id));
        return snap.exists() ? (snap.data() as Vehicle) : null;
    }

    async create(vehicle: Vehicle): Promise<void> {
        await setDoc(doc(db, 'vehicles', vehicle.id), vehicle);
    }

    async findByUser(userId: string): Promise<Vehicle[]> {
        const q = query(collection(db, 'vehicles'), where('userId', '==', userId));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => doc.data() as Vehicle);
    }
}
