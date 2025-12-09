import { injectable } from 'inversify';
import { IVehicleRepository } from '../../core/interfaces/IVehicleRepository';
import { VehicleSpecs } from '../../core/types/models';
import { getFirestore } from 'firebase-admin/firestore';

@injectable()
export class FirestoreVehicleRepository implements IVehicleRepository {
    private db = getFirestore();

    async getSpecs(vehicleId: string): Promise<VehicleSpecs | null> {
        const doc = await this.db.collection('vehicles').doc(vehicleId).get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (!data?.specs) return null;
        return data.specs as VehicleSpecs;
    }
}
