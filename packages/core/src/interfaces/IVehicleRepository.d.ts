import { Vehicle } from '../types/models';
export interface IVehicleRepository {
    findById(id: string): Promise<Vehicle | null>;
    create(vehicle: Vehicle): Promise<void>;
    findByUser(userId: string): Promise<Vehicle[]>;
}
