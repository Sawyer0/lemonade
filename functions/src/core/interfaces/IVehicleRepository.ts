import { VehicleSpecs } from '../types/models';

export interface IVehicleRepository {
    getSpecs(vehicleId: string): Promise<VehicleSpecs | null>;
}
